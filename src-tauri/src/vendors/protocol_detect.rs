use serde::{Deserialize, Serialize};
use serde_json::Value;

use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ProtocolType {
    Openai,
    Gemini,
    Anthropic,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ProtocolSuggestionType {
    SwitchPlatform,
    FixUrl,
    CheckKey,
    None,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct ProtocolSuggestion {
    #[serde(rename = "type")]
    pub kind: ProtocolSuggestionType,
    pub message: String,
    #[serde(rename = "suggestedPlatform", skip_serializing_if = "Option::is_none")]
    pub suggested_platform: Option<String>,
    #[serde(rename = "i18nKey", skip_serializing_if = "Option::is_none")]
    pub i18n_key: Option<String>,
    #[serde(rename = "i18nParams", skip_serializing_if = "Option::is_none")]
    pub i18n_params: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct ProtocolDetectionResponse {
    pub success: bool,
    pub protocol: ProtocolType,
    pub confidence: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(rename = "fixedBaseUrl", skip_serializing_if = "Option::is_none")]
    pub fixed_base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub models: Option<Vec<String>>,
    #[serde(rename = "latencyMs", skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<ProtocolSuggestion>,
}

// Mirrors AionUi's API_PATH_SUFFIXES list (not exhaustive, but covers common paste cases).
const API_PATH_SUFFIXES: &[&str] = &[
    // Gemini
    "/v1beta/models",
    "/v1/models",
    "/models",
    // OpenAI
    "/v1/chat/completions",
    "/chat/completions",
    "/v1/completions",
    "/completions",
    "/v1/embeddings",
    "/embeddings",
    // Anthropic
    "/v1/messages",
    "/messages",
];

fn normalize_base_url(base_url: &str) -> String {
    base_url.trim().trim_end_matches('/').to_string()
}

fn remove_api_path_suffix(base_url: &str) -> Option<String> {
    let url = base_url.trim().trim_end_matches('/');
    if url.is_empty() {
        return None;
    }

    let mut suffixes: Vec<&str> = API_PATH_SUFFIXES.to_vec();
    suffixes.sort_by(|a, b| b.len().cmp(&a.len())); // match longest first

    let lower = url.to_lowercase();
    for suffix in suffixes {
        if lower.ends_with(&suffix.to_lowercase()) {
            let next = url[..url.len().saturating_sub(suffix.len())]
                .trim_end_matches('/')
                .to_string();
            if next.is_empty() {
                return None;
            }
            return Some(next);
        }
    }
    None
}

pub(crate) fn parse_api_keys(api_key_string: &str) -> Vec<String> {
    api_key_string
        .split(|c| c == ',' || c == '\n' || c == '\r')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

pub(crate) fn build_base_url_candidates(raw_base_url: &str) -> Vec<String> {
    let base_url = normalize_base_url(raw_base_url);
    if base_url.is_empty() {
        return Vec::new();
    }

    let has_protocol = base_url.to_lowercase().starts_with("http://")
        || base_url.to_lowercase().starts_with("https://");

    let urls_to_process: Vec<String> = if has_protocol {
        vec![base_url]
    } else {
        vec![format!("https://{}", base_url), format!("http://{}", base_url)]
    };

    let mut candidates: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for url in urls_to_process {
        if seen.insert(url.clone()) {
            candidates.push(url.clone());
        }
        if let Some(stripped) = remove_api_path_suffix(&url) {
            if stripped != url && seen.insert(stripped.clone()) {
                candidates.push(stripped);
            }
        }
    }

    candidates
}

fn guess_protocol_from_url(base_url: &str) -> Option<ProtocolType> {
    let url = base_url.to_lowercase();

    // AionUi uses a much larger list; keep the common high-signal ones.
    let openai_patterns = [
        "api.openai.com",
        ".openai.azure.com",
        "openrouter.ai",
        "api.groq.com",
        "api.together.xyz",
        "api.perplexity.ai",
        "api.deepseek.com",
        "api.moonshot.cn",
        "api.mistral.ai",
        "dashscope.aliyuncs.com",
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
    ];
    let gemini_patterns = [
        "generativelanguage.googleapis.com",
        "aiplatform.googleapis.com",
        "aistudio.google.com",
    ];
    let anthropic_patterns = ["api.anthropic.com", "claude.ai"];

    if anthropic_patterns.iter().any(|p| url.contains(p)) {
        return Some(ProtocolType::Anthropic);
    }
    if gemini_patterns.iter().any(|p| url.contains(p)) {
        return Some(ProtocolType::Gemini);
    }
    if openai_patterns.iter().any(|p| url.contains(p)) {
        return Some(ProtocolType::Openai);
    }

    None
}

fn guess_protocol_from_key(api_key: &str) -> Option<ProtocolType> {
    let key = api_key.trim();
    if key.is_empty() {
        return None;
    }

    // AionUi's key patterns (simplified).
    if key.starts_with("sk-ant-") {
        return Some(ProtocolType::Anthropic);
    }
    if key.starts_with("AIza") && key.len() >= 20 {
        return Some(ProtocolType::Gemini);
    }
    if key.starts_with("sk-") && key.len() >= 20 {
        return Some(ProtocolType::Openai);
    }

    None
}

fn extract_openai_models(json: &Value) -> Vec<String> {
    let mut models: Vec<String> = Vec::new();
    if let Some(arr) = json.get("data").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                models.push(id.to_string());
            }
        }
    }
    if models.is_empty() {
        if let Some(arr) = json.get("models").and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                    models.push(id.to_string());
                } else if let Some(name) = item.get("name").and_then(|v| v.as_str()) {
                    models.push(name.to_string());
                }
            }
        }
    }
    models.sort();
    models.dedup();
    models
}

fn extract_gemini_models(json: &Value) -> Vec<String> {
    let mut models: Vec<String> = Vec::new();
    if let Some(arr) = json.get("models").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(name) = item.get("name").and_then(|v| v.as_str()) {
                let id = name.strip_prefix("models/").unwrap_or(name);
                models.push(id.to_string());
            }
        }
    }
    models.sort();
    models.dedup();
    models
}

fn is_anthropic_response(json: &Value) -> bool {
    // Success: { type: "message", id: "msg_..." }
    if json.get("type").and_then(|v| v.as_str()) == Some("message") {
        if let Some(id) = json.get("id").and_then(|v| v.as_str()) {
            if id.starts_with("msg_") {
                return true;
            }
        }
    }

    // Error: { type: "error", error: { type: "...", message: "..." } }
    if json.get("type").and_then(|v| v.as_str()) == Some("error") {
        if let Some(err) = json.get("error").and_then(|v| v.as_object()) {
            if err.get("type").and_then(|v| v.as_str()).is_some()
                && err.get("message").and_then(|v| v.as_str()).is_some()
            {
                return true;
            }
        }
    }

    false
}

async fn test_openai_protocol(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
) -> ProtocolDetectionResponse {
    let endpoints = [
        ("models", "/models", None::<&str>),
        ("v1_models", "/v1/models", Some("/v1")),
    ];

    let mut last_error: Option<String> = None;

    for (_name, path, fixed_suffix) in endpoints {
        let url = format!("{}{}", base_url, path);
        let resp = client
            .get(url)
            .bearer_auth(api_key)
            .header("Accept", "application/json")
            .send()
            .await;

        let Ok(resp) = resp else {
            last_error = Some(format!("Request failed: {}", path));
            continue;
        };
        let status = resp.status();

        if status.is_success() {
            let bytes = match resp.bytes().await {
                Ok(b) => b,
                Err(_) => {
                    last_error = Some("Failed to read response body".to_string());
                    continue;
                }
            };
            if let Ok(json) = serde_json::from_slice::<Value>(&bytes) {
                let models = extract_openai_models(&json);
                if !models.is_empty() {
                    let fixed_base_url = fixed_suffix.map(|s| format!("{}{}", base_url, s));
                    return ProtocolDetectionResponse {
                        success: true,
                        protocol: ProtocolType::Openai,
                        confidence: 95,
                        error: None,
                        fixed_base_url,
                        models: Some(models),
                        latency_ms: None,
                        suggestion: None,
                    };
                }
            }
            // If OK but cannot parse models, keep probing other endpoints.
            last_error = Some("Response did not contain a model list".to_string());
            continue;
        }

        if status.as_u16() == 401 {
            return ProtocolDetectionResponse {
                success: false,
                protocol: ProtocolType::Openai,
                confidence: 70,
                error: Some("Invalid API key for OpenAI protocol".to_string()),
                fixed_base_url: None,
                models: None,
                latency_ms: None,
                suggestion: Some(ProtocolSuggestion {
                    kind: ProtocolSuggestionType::CheckKey,
                    message: "Detected OpenAI-compatible endpoint but the API key seems invalid.".to_string(),
                    suggested_platform: None,
                    i18n_key: Some("settings.vendor.openaiDialog.suggestCheckKey".to_string()),
                    i18n_params: None,
                }),
            };
        }

        // Keep a readable error for UI/debugging.
        let text = resp
            .text()
            .await
            .unwrap_or_else(|_| "<failed to read error body>".to_string());
        let snippet = if text.len() > 400 {
            format!("{}...", &text[..400])
        } else {
            text
        };
        last_error = Some(format!("HTTP {} from {}: {}", status.as_u16(), path, snippet));
    }

    ProtocolDetectionResponse {
        success: false,
        protocol: ProtocolType::Unknown,
        confidence: 0,
        error: Some(
            last_error.unwrap_or_else(|| "Not an OpenAI-compatible API endpoint".to_string()),
        ),
        fixed_base_url: None,
        models: None,
        latency_ms: None,
        suggestion: None,
    }
}

async fn test_gemini_protocol(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
) -> ProtocolDetectionResponse {
    let endpoints = [
        ("v1beta", "/v1beta/models"),
        ("v1", "/v1/models"),
        ("root", "/models"),
    ];

    for (_name, path) in endpoints {
        let url = format!("{}{}?key={}", base_url, path, urlencoding::encode(api_key));
        let resp = client
            .get(url)
            .header("Accept", "application/json")
            .send()
            .await;

        let Ok(resp) = resp else {
            continue;
        };

        let status = resp.status();
        let bytes = match resp.bytes().await {
            Ok(b) => b,
            Err(_) => continue,
        };
        if status.is_success() {
            if let Ok(json) = serde_json::from_slice::<Value>(&bytes) {
                let models = extract_gemini_models(&json);
                if !models.is_empty() {
                    return ProtocolDetectionResponse {
                        success: true,
                        protocol: ProtocolType::Gemini,
                        confidence: 95,
                        error: None,
                        fixed_base_url: None,
                        models: Some(models),
                        latency_ms: None,
                        suggestion: Some(ProtocolSuggestion {
                            kind: ProtocolSuggestionType::SwitchPlatform,
                            message: "Detected Gemini protocol.".to_string(),
                            suggested_platform: Some("gemini".to_string()),
                            i18n_key: Some("settings.vendor.openaiDialog.suggestGemini".to_string()),
                            i18n_params: None,
                        }),
                    };
                }
            }
        }

        // AionUi treats some 400/403 as a strong hint if error says API key.
        if status.as_u16() == 400 || status.as_u16() == 403 {
            let text = String::from_utf8_lossy(&bytes);
            if text.to_lowercase().contains("api key") || text.to_lowercase().contains("apikey") {
                return ProtocolDetectionResponse {
                    success: false,
                    protocol: ProtocolType::Gemini,
                    confidence: 80,
                    error: Some("Invalid API key format for Gemini".to_string()),
                    fixed_base_url: None,
                    models: None,
                    latency_ms: None,
                    suggestion: Some(ProtocolSuggestion {
                        kind: ProtocolSuggestionType::CheckKey,
                        message: "Detected Gemini protocol but the API key seems invalid.".to_string(),
                        suggested_platform: None,
                        i18n_key: Some("settings.vendor.openaiDialog.suggestCheckKey".to_string()),
                        i18n_params: None,
                    }),
                };
            }
        }
    }

    ProtocolDetectionResponse {
        success: false,
        protocol: ProtocolType::Unknown,
        confidence: 0,
        error: Some("Not a Gemini API endpoint".to_string()),
        fixed_base_url: None,
        models: None,
        latency_ms: None,
        suggestion: None,
    }
}

async fn test_anthropic_protocol(
    client: &reqwest::Client,
    base_url: &str,
    api_key: &str,
) -> ProtocolDetectionResponse {
    let endpoints = [
        ("v1", "/v1/messages", Some("/v1")),
        ("root", "/messages", None::<&str>),
    ];

    let body = serde_json::json!({
        "model": "claude-3-haiku-20240307",
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "hi"}]
    });

    for (_name, path, fixed_suffix) in endpoints {
        let url = format!("{}{}", base_url, path);
        let resp = client
            .post(url)
            .header("Content-Type", "application/json")
            .header("anthropic-version", "2023-06-01")
            .header("x-api-key", api_key)
            .json(&body)
            .send()
            .await;

        let Ok(resp) = resp else {
            continue;
        };
        let status = resp.status();

        let json: Value = match resp.json().await {
            Ok(v) => v,
            Err(_) => continue,
        };

        if is_anthropic_response(&json) {
            // AionUi: 200 or 400 both count as valid protocol.
            if status.is_success() || status.as_u16() == 400 {
                let fixed_base_url = fixed_suffix.map(|s| format!("{}{}", base_url, s));
                return ProtocolDetectionResponse {
                    success: true,
                    protocol: ProtocolType::Anthropic,
                    confidence: if status.is_success() { 95 } else { 90 },
                    error: None,
                    fixed_base_url,
                    models: Some(vec![
                        "claude-3-opus-20240229".to_string(),
                        "claude-3-sonnet-20240229".to_string(),
                        "claude-3-haiku-20240307".to_string(),
                        "claude-3-5-sonnet-20241022".to_string(),
                    ]),
                    latency_ms: None,
                    suggestion: Some(ProtocolSuggestion {
                        kind: ProtocolSuggestionType::SwitchPlatform,
                        message: "Detected Anthropic/Claude protocol.".to_string(),
                        suggested_platform: Some("claude".to_string()),
                        i18n_key: Some("settings.vendor.openaiDialog.suggestClaude".to_string()),
                        i18n_params: None,
                    }),
                };
            }

            if status.as_u16() == 401 {
                return ProtocolDetectionResponse {
                    success: false,
                    protocol: ProtocolType::Anthropic,
                    confidence: 70,
                    error: Some("Invalid API key for Anthropic protocol".to_string()),
                    fixed_base_url: None,
                    models: None,
                    latency_ms: None,
                    suggestion: Some(ProtocolSuggestion {
                        kind: ProtocolSuggestionType::CheckKey,
                        message: "Detected Anthropic protocol but the API key seems invalid.".to_string(),
                        suggested_platform: None,
                        i18n_key: Some("settings.vendor.openaiDialog.suggestCheckKey".to_string()),
                        i18n_params: None,
                    }),
                };
            }
        }
    }

    ProtocolDetectionResponse {
        success: false,
        protocol: ProtocolType::Unknown,
        confidence: 0,
        error: Some("Not an Anthropic API endpoint".to_string()),
        fixed_base_url: None,
        models: None,
        latency_ms: None,
        suggestion: None,
    }
}

pub(crate) async fn detect_protocol(
    base_url: &str,
    api_key_string: &str,
    timeout_ms: u64,
    preferred_protocol: Option<ProtocolType>,
) -> ProtocolDetectionResponse {
    let candidates = build_base_url_candidates(base_url);
    let api_keys = parse_api_keys(api_key_string);

    if candidates.is_empty() {
        return ProtocolDetectionResponse {
            success: false,
            protocol: ProtocolType::Unknown,
            confidence: 0,
            error: Some("Base URL is required".to_string()),
            fixed_base_url: None,
            models: None,
            latency_ms: None,
            suggestion: None,
        };
    }
    if api_keys.is_empty() {
        return ProtocolDetectionResponse {
            success: false,
            protocol: ProtocolType::Unknown,
            confidence: 0,
            error: Some("API key is required".to_string()),
            fixed_base_url: None,
            models: None,
            latency_ms: None,
            suggestion: None,
        };
    }

    let first_key = api_keys[0].clone();

    let url_guess = guess_protocol_from_url(&candidates[0]);
    let key_guess = guess_protocol_from_key(&first_key);

    let mut protocols_to_test: Vec<ProtocolType> = Vec::new();
    if let Some(p) = preferred_protocol {
        if p != ProtocolType::Unknown {
            protocols_to_test.push(p);
        }
    }
    for guess in [url_guess, key_guess] {
        if let Some(p) = guess {
            if !protocols_to_test.contains(&p) {
                protocols_to_test.push(p);
            }
        }
    }
    for p in [ProtocolType::Gemini, ProtocolType::Openai, ProtocolType::Anthropic] {
        if !protocols_to_test.contains(&p) {
            protocols_to_test.push(p);
        }
    }

    let client = match reqwest::Client::builder()
        .http1_only()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return ProtocolDetectionResponse {
                success: false,
                protocol: ProtocolType::Unknown,
                confidence: 0,
                error: Some(format!("Failed to build HTTP client: {}", e)),
                fixed_base_url: None,
                models: None,
                latency_ms: None,
                suggestion: None,
            };
        }
    };

    let started = Instant::now();
    let mut first_error: Option<String> = None;

    for protocol in protocols_to_test {
        for candidate_base_url in &candidates {
            let result = match protocol {
                ProtocolType::Openai => test_openai_protocol(&client, candidate_base_url, &first_key).await,
                ProtocolType::Gemini => test_gemini_protocol(&client, candidate_base_url, &first_key).await,
                ProtocolType::Anthropic => test_anthropic_protocol(&client, candidate_base_url, &first_key).await,
                ProtocolType::Unknown => ProtocolDetectionResponse {
                    success: false,
                    protocol: ProtocolType::Unknown,
                    confidence: 0,
                    error: Some("Unknown protocol".to_string()),
                    fixed_base_url: None,
                    models: None,
                    latency_ms: None,
                    suggestion: None,
                },
            };

            if result.success {
                let mut result = result;
                result.latency_ms = Some(started.elapsed().as_millis() as u64);

                // If the endpoint claims a protocol but user is configuring OpenAI-compatible,
                // help the UI show a reasonable suggestion.
                if result.protocol == ProtocolType::Gemini {
                    result.suggestion.get_or_insert(ProtocolSuggestion {
                        kind: ProtocolSuggestionType::SwitchPlatform,
                        message: "Detected Gemini protocol.".to_string(),
                        suggested_platform: Some("gemini".to_string()),
                        i18n_key: Some("settings.vendor.openaiDialog.suggestGemini".to_string()),
                        i18n_params: None,
                    });
                } else if result.protocol == ProtocolType::Anthropic {
                    result.suggestion.get_or_insert(ProtocolSuggestion {
                        kind: ProtocolSuggestionType::SwitchPlatform,
                        message: "Detected Anthropic/Claude protocol.".to_string(),
                        suggested_platform: Some("claude".to_string()),
                        i18n_key: Some("settings.vendor.openaiDialog.suggestClaude".to_string()),
                        i18n_params: None,
                    });
                }

                return result;
            }

            if first_error.is_none() {
                first_error = result.error.clone();
            }
        }
    }

    ProtocolDetectionResponse {
        success: false,
        protocol: ProtocolType::Unknown,
        confidence: 0,
        error: first_error.or_else(|| Some("Detection failed".to_string())),
        fixed_base_url: None,
        models: None,
        latency_ms: Some(started.elapsed().as_millis() as u64),
        suggestion: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn candidates_add_protocols_and_strip_suffix() {
        let c = build_base_url_candidates("api.example.com/v1/chat/completions/");
        assert!(c[0].starts_with("https://"));
        assert!(c.iter().any(|u| u.contains("api.example.com/v1/chat/completions")));
        // Stripping the known suffix should fall back to the host root (same as AionUi).
        assert!(c.iter().any(|u| u.ends_with("api.example.com")));
    }

    #[test]
    fn remove_suffix_prefers_longest_match() {
        assert_eq!(
            remove_api_path_suffix("https://x/y/v1/chat/completions").unwrap(),
            "https://x/y"
        );
        assert_eq!(
            remove_api_path_suffix("https://x/y/chat/completions").unwrap(),
            "https://x/y"
        );
    }

    #[test]
    fn api_key_parsing_splits_lines_and_commas() {
        assert_eq!(
            parse_api_keys("a,b\nc\r\nd"),
            vec!["a", "b", "c", "d"]
        );
    }

    #[test]
    fn guess_by_key_works() {
        assert_eq!(guess_protocol_from_key("sk-ant-xxx"), Some(ProtocolType::Anthropic));
        assert_eq!(
            guess_protocol_from_key("AIza12345678901234567890123456789012345"),
            Some(ProtocolType::Gemini)
        );
        assert_eq!(guess_protocol_from_key("sk-12345678901234567890"), Some(ProtocolType::Openai));
    }
}

use serde::{Deserialize, Serialize};
use serde_json::Value;

use std::time::{Duration, Instant};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub(crate) struct OpenAIProbeResult {
    pub success: bool,
    #[serde(rename = "fixedBaseUrl", skip_serializing_if = "Option::is_none")]
    pub fixed_base_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub models: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(rename = "latencyMs", skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
}

fn strip_trailing_slashes(mut s: String) -> String {
    while s.ends_with('/') {
        s.pop();
    }
    s
}

pub(crate) fn normalize_openai_base_url(input: &str) -> String {
    let mut s = strip_trailing_slashes(input.trim().to_string());
    if s.is_empty() {
        return s;
    }

    // If user pastes a full endpoint, trim back to a reasonable base URL.
    // Order matters: strip the most specific suffixes first.
    for suffix in ["/chat/completions", "/models"] {
        if s.ends_with(suffix) {
            s.truncate(s.len().saturating_sub(suffix.len()));
            s = strip_trailing_slashes(s);
        }
    }

    s
}

pub(crate) fn candidate_openai_bases(input_base_url: &str) -> Vec<String> {
    let base = normalize_openai_base_url(input_base_url);
    if base.is_empty() {
        return Vec::new();
    }

    let mut candidates = Vec::new();
    if base.ends_with("/v1") {
        candidates.push(base.clone());
        let root = base.trim_end_matches("/v1").to_string();
        if !root.is_empty() {
            candidates.push(root);
        }
    } else {
        candidates.push(base.clone());
        candidates.push(format!("{}/v1", base));
    }

    // Dedup while preserving order.
    let mut seen = std::collections::HashSet::new();
    candidates
        .into_iter()
        .filter(|s| !s.trim().is_empty())
        .filter(|s| seen.insert(s.clone()))
        .collect()
}

fn extract_model_ids(value: &Value) -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();

    // OpenAI-style: { "data": [ { "id": "..." }, ... ] }
    if let Some(arr) = value.get("data").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                ids.push(id.to_string());
            }
        }
    }

    // Some providers may return { "models": [ { "id": "..." }, ... ] }
    if ids.is_empty() {
        if let Some(arr) = value.get("models").and_then(|v| v.as_array()) {
            for item in arr {
                if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                    ids.push(id.to_string());
                }
            }
        }
    }

    ids.sort();
    ids.dedup();
    ids
}

fn first_api_key(api_key: &str) -> Option<String> {
    api_key
        .split(|c| c == ',' || c == '\n' || c == '\r')
        .map(|s| s.trim())
        .find(|s| !s.is_empty())
        .map(|s| s.to_string())
}

pub(crate) async fn probe_openai_models(
    base_url: &str,
    api_key: &str,
    timeout_ms: u64,
) -> OpenAIProbeResult {
    let key = match first_api_key(api_key) {
        Some(k) => k,
        None => {
            return OpenAIProbeResult {
                success: false,
                fixed_base_url: None,
                models: None,
                error: Some("API key is required".to_string()),
                latency_ms: None,
            };
        }
    };

    let candidates = candidate_openai_bases(base_url);
    if candidates.is_empty() {
        return OpenAIProbeResult {
            success: false,
            fixed_base_url: None,
            models: None,
            error: Some("Base URL is required".to_string()),
            latency_ms: None,
        };
    }

    let client = match reqwest::Client::builder()
        // Many OpenAI-compatible gateways sit behind CDNs/WAFs that may reset HTTP/2 connections.
        // Force HTTP/1.1 to improve compatibility (curl --http1.1 mirrors this behavior).
        .http1_only()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return OpenAIProbeResult {
                success: false,
                fixed_base_url: None,
                models: None,
                error: Some(format!("Failed to build HTTP client: {}", e)),
                latency_ms: None,
            };
        }
    };

    let mut best_error: Option<String> = None;
    let mut best_fixed: Option<String> = None;
    let mut best_latency: Option<u64> = None;

    for candidate in candidates {
        let url = format!("{}/models", candidate);
        let started = Instant::now();

        let resp = client
            .get(url)
            .bearer_auth(&key)
            .header("Accept", "application/json")
            .send()
            .await;

        let latency_ms = started.elapsed().as_millis() as u64;

        match resp {
            Ok(resp) => {
                let status = resp.status();
                if status.is_success() {
                    match resp.json::<Value>().await {
                        Ok(json) => {
                            let models = extract_model_ids(&json);
                            if !models.is_empty() {
                                return OpenAIProbeResult {
                                    success: true,
                                    fixed_base_url: Some(candidate),
                                    models: Some(models),
                                    error: None,
                                    latency_ms: Some(latency_ms),
                                };
                            }
                            best_error = Some("No models found in response".to_string());
                            best_fixed = Some(candidate);
                            best_latency = Some(latency_ms);
                        }
                        Err(e) => {
                            best_error = Some(format!("Failed to parse response JSON: {}", e));
                            best_fixed = Some(candidate);
                            best_latency = Some(latency_ms);
                        }
                    }
                } else {
                    // Prefer auth errors over 404 when all attempts fail, because it tells the user what to fix.
                    let text = resp.text().await.unwrap_or_default();
                    let snippet = if text.len() > 400 {
                        format!("{}...", &text[..400])
                    } else {
                        text
                    };

                    let msg = format!("HTTP {} from /models: {}", status.as_u16(), snippet);
                    let is_auth = status.as_u16() == 401 || status.as_u16() == 403;
                    if is_auth || best_error.is_none() {
                        best_error = Some(msg);
                        best_fixed = Some(candidate);
                        best_latency = Some(latency_ms);
                    }
                    // If 404, keep trying other candidates (root vs /v1).
                }
            }
            Err(e) => {
                let msg = format!("Request failed: {}", e);
                if best_error.is_none() {
                    best_error = Some(msg);
                    best_fixed = Some(candidate);
                    best_latency = Some(latency_ms);
                }
            }
        }
    }

    OpenAIProbeResult {
        success: false,
        fixed_base_url: best_fixed,
        models: None,
        error: best_error.or_else(|| Some("Probe failed".to_string())),
        latency_ms: best_latency,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_base_url_strips_common_suffixes() {
        assert_eq!(
            normalize_openai_base_url("https://api.example.com/v1/chat/completions"),
            "https://api.example.com/v1"
        );
        assert_eq!(
            normalize_openai_base_url("https://api.example.com/v1/models"),
            "https://api.example.com/v1"
        );
        assert_eq!(
            normalize_openai_base_url("https://api.example.com/chat/completions/"),
            "https://api.example.com"
        );
        assert_eq!(normalize_openai_base_url("  https://x/y/v1/  "), "https://x/y/v1");
    }

    #[test]
    fn candidate_generation_prefers_user_base_but_adds_v1_variant() {
        assert_eq!(
            candidate_openai_bases("https://api.example.com"),
            vec!["https://api.example.com", "https://api.example.com/v1"]
        );
        assert_eq!(
            candidate_openai_bases("https://api.example.com/v1"),
            vec!["https://api.example.com/v1", "https://api.example.com"]
        );
    }

    #[test]
    fn extract_model_ids_handles_openai_shape() {
        let v: Value = serde_json::json!({
            "object": "list",
            "data": [
                {"id": "gpt-4o"},
                {"id": "gpt-4.1"},
                {"id": "gpt-4o"} // dup
            ]
        });
        assert_eq!(extract_model_ids(&v), vec!["gpt-4.1", "gpt-4o"]);
    }
}

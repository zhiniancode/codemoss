//! OpenAI-compatible engine implementation.
//!
//! This engine talks directly to an OpenAI-compatible HTTP endpoint
//! (typically `{baseUrl}/chat/completions`) and streams SSE deltas as
//! unified EngineEvents.

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::{broadcast, Mutex};
use tokio::task::JoinHandle;

use super::events::EngineEvent;
use super::{EngineType, SendMessageParams};
use crate::vendors;

#[derive(Debug, Clone)]
pub struct OpenAITurnEvent {
    pub turn_id: String,
    pub event: EngineEvent,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
enum ChatRole {
    System,
    User,
    Assistant,
}

#[derive(Debug, Clone, Serialize)]
struct ChatMessage {
    role: ChatRole,
    content: String,
}

#[derive(Debug, Serialize)]
struct ChatCompletionRequest {
    model: String,
    messages: Vec<ChatMessage>,
    stream: bool,
}

pub struct OpenAIWorkspaceSession {
    workspace_id: String,
    event_sender: broadcast::Sender<OpenAITurnEvent>,
    conversations: Mutex<HashMap<String, Vec<ChatMessage>>>,
    active_tasks: Mutex<HashMap<String, JoinHandle<()>>>,
    interrupted: AtomicBool,
}

impl OpenAIWorkspaceSession {
    pub fn new(workspace_id: String) -> Self {
        let (event_sender, _) = broadcast::channel(1024);
        Self {
            workspace_id,
            event_sender,
            conversations: Mutex::new(HashMap::new()),
            active_tasks: Mutex::new(HashMap::new()),
            interrupted: AtomicBool::new(false),
        }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<OpenAITurnEvent> {
        self.event_sender.subscribe()
    }

    pub async fn track_task(&self, turn_id: String, handle: JoinHandle<()>) {
        let mut tasks = self.active_tasks.lock().await;
        tasks.insert(turn_id, handle);
    }

    async fn clear_task(&self, turn_id: &str) {
        let mut tasks = self.active_tasks.lock().await;
        tasks.remove(turn_id);
    }

    fn emit_turn_event(&self, turn_id: &str, event: EngineEvent) {
        let _ = self.event_sender.send(OpenAITurnEvent {
            turn_id: turn_id.to_string(),
            event,
        });
    }

    pub fn emit_error(&self, turn_id: &str, error: String) {
        self.emit_turn_event(
            turn_id,
            EngineEvent::TurnError {
                workspace_id: self.workspace_id.clone(),
                error,
                code: None,
            },
        );
    }

    pub fn interrupt(&self) {
        self.interrupted.store(true, Ordering::SeqCst);
    }

    pub async fn interrupt_and_abort(&self) {
        self.interrupted.store(true, Ordering::SeqCst);
        let mut tasks = self.active_tasks.lock().await;
        for (_id, handle) in tasks.drain() {
            handle.abort();
        }
    }

    async fn load_active_provider() -> Result<(String, String, String), String> {
        let providers = vendors::vendor_get_openai_providers()
            .await
            .map_err(|e| format!("Failed to load providers: {}", e))?;
        let active = providers
            .into_iter()
            .find(|p| p.is_active)
            .ok_or_else(|| {
                "No OpenAI Compatible provider is enabled. Enable one in Settings > Vendor Management."
                    .to_string()
            })?;

        let base_url = active
            .base_url
            .unwrap_or_default()
            .trim()
            .trim_end_matches('/')
            .to_string();
        let api_key = active.api_key.unwrap_or_default().trim().to_string();
        let default_model = active.default_model.unwrap_or_default().trim().to_string();

        if base_url.is_empty() || api_key.is_empty() || default_model.is_empty() {
            return Err(
                "OpenAI Compatible provider is incomplete (baseUrl/apiKey/defaultModel required)."
                    .to_string(),
            );
        }

        Ok((base_url, api_key, default_model))
    }

    fn extract_delta(chunk: &Value) -> Option<String> {
        // OpenAI-style streaming: choices[0].delta.content
        let delta = chunk
            .pointer("/choices/0/delta/content")
            .and_then(|v| v.as_str())
            .or_else(|| chunk.pointer("/choices/0/delta/text").and_then(|v| v.as_str()));

        delta
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
    }

    pub async fn send_message(&self, params: SendMessageParams, turn_id: &str) -> Result<(), String> {
        self.interrupted.store(false, Ordering::SeqCst);

        let (base_url, api_key, provider_default_model) = Self::load_active_provider().await?;
        let model = params
            .model
            .clone()
            .filter(|m| !m.trim().is_empty())
            .unwrap_or(provider_default_model);

        let mut session_id = params.session_id.clone();
        let is_new_session = !params.continue_session || session_id.as_deref().unwrap_or("").is_empty();
        if is_new_session {
            session_id = Some(format!("ses_{}", uuid::Uuid::new_v4()));
        }
        let session_id = session_id.unwrap();

        // Ensure conversation exists.
        {
            let mut conv = self.conversations.lock().await;
            if params.continue_session && !conv.contains_key(&session_id) {
                return Err(format!("Session not found: {}", session_id));
            }
            conv.entry(session_id.clone()).or_insert_with(Vec::new);
        }

        if is_new_session {
            self.emit_turn_event(
                turn_id,
                EngineEvent::SessionStarted {
                    workspace_id: self.workspace_id.clone(),
                    session_id: session_id.clone(),
                    engine: EngineType::OpenAI,
                },
            );
        }

        self.emit_turn_event(
            turn_id,
            EngineEvent::TurnStarted {
                workspace_id: self.workspace_id.clone(),
                turn_id: turn_id.to_string(),
            },
        );

        // Append the user message to history.
        {
            let mut conv = self.conversations.lock().await;
            let history = conv.get_mut(&session_id).expect("conversation exists");
            history.push(ChatMessage {
                role: ChatRole::User,
                content: params.text.clone(),
            });
        }

        // Snapshot messages for this request.
        let messages = {
            let conv = self.conversations.lock().await;
            conv.get(&session_id).cloned().unwrap_or_default()
        };

        let request = ChatCompletionRequest {
            model,
            messages,
            stream: true,
        };

        let url = format!("{}/chat/completions", base_url);
        // Some OpenAI-compatible gateways reset HTTP/2 connections (common with CDNs/WAFs).
        // SSE streaming works fine over HTTP/1.1 and is typically more compatible.
        let client = reqwest::Client::builder()
            .http1_only()
            .build()
            .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

        let mut response = client
            .post(url)
            .bearer_auth(api_key)
            .json(&request)
            .send()
            .await
            .map_err(|e| format!("Failed to call OpenAI-compatible endpoint: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response
                .text()
                .await
                .unwrap_or_else(|_| "<failed to read error body>".to_string());
            let error = format!("OpenAI Compatible request failed ({}): {}", status, body);
            self.emit_turn_event(
                turn_id,
                EngineEvent::TurnError {
                    workspace_id: self.workspace_id.clone(),
                    error: error.clone(),
                    code: Some(status.as_u16().to_string()),
                },
            );
            self.clear_task(turn_id).await;
            return Err(error);
        }

        let mut sse_buffer = String::new();
        let mut assistant_text = String::new();
        let mut done = false;

        loop {
            if self.interrupted.load(Ordering::SeqCst) {
                let error = "Interrupted".to_string();
                self.emit_turn_event(
                    turn_id,
                    EngineEvent::TurnError {
                        workspace_id: self.workspace_id.clone(),
                        error: error.clone(),
                        code: Some("INTERRUPTED".to_string()),
                    },
                );
                self.clear_task(turn_id).await;
                return Err(error);
            }

            let next = response
                .chunk()
                .await
                .map_err(|e| format!("OpenAI Compatible stream read failed: {}", e))?;
            let Some(bytes) = next else { break };
            if bytes.is_empty() {
                continue;
            }

            let chunk_str = String::from_utf8_lossy(&bytes);
            sse_buffer.push_str(&chunk_str);

            while let Some(pos) = sse_buffer.find('\n') {
                let mut line = sse_buffer[..pos].to_string();
                sse_buffer = sse_buffer[pos + 1..].to_string();
                if line.ends_with('\r') {
                    line.pop();
                }
                let trimmed = line.trim();
                if !trimmed.starts_with("data:") {
                    continue;
                }
                let data = trimmed.trim_start_matches("data:").trim();
                if data.is_empty() {
                    continue;
                }
                if data == "[DONE]" {
                    done = true;
                    break;
                }
                let parsed: Value = match serde_json::from_str(data) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                if let Some(delta) = Self::extract_delta(&parsed) {
                    assistant_text.push_str(&delta);
                    self.emit_turn_event(
                        turn_id,
                        EngineEvent::TextDelta {
                            workspace_id: self.workspace_id.clone(),
                            text: delta,
                        },
                    );
                }
            }

            if done {
                break;
            }
        }

        // Persist assistant message into history for continuation.
        if !assistant_text.trim().is_empty() {
            let mut conv = self.conversations.lock().await;
            if let Some(history) = conv.get_mut(&session_id) {
                history.push(ChatMessage {
                    role: ChatRole::Assistant,
                    content: assistant_text.clone(),
                });
            }
        }

        self.emit_turn_event(
            turn_id,
            EngineEvent::TurnCompleted {
                workspace_id: self.workspace_id.clone(),
                result: Some(json!({
                    "engine": "openai",
                    "sessionId": session_id,
                })),
            },
        );

        self.clear_task(turn_id).await;
        Ok(())
    }
}

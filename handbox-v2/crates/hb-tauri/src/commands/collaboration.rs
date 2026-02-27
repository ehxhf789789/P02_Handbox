//! Collaboration commands — Real-time collaboration backend.
//!
//! Note: Full WebSocket support requires additional setup with a dedicated server.
//! This module provides the backend state management and session handling.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::State;
use tokio::sync::RwLock;

// ========== Types ==========

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CollaboratorRole {
    Owner,
    Editor,
    Viewer,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CursorPosition {
    pub x: f64,
    pub y: f64,
    pub node_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collaborator {
    pub id: String,
    pub name: String,
    pub color: String,
    pub is_online: bool,
    pub last_active: String,
    pub role: CollaboratorRole,
    pub cursor: Option<CursorPosition>,
    pub selection: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionSettings {
    pub allow_editing: bool,
    pub allow_execution: bool,
    pub allow_invite: bool,
    pub max_collaborators: usize,
    pub auto_save: bool,
    pub auto_save_interval: u64,
}

impl Default for SessionSettings {
    fn default() -> Self {
        Self {
            allow_editing: true,
            allow_execution: true,
            allow_invite: true,
            max_collaborators: 10,
            auto_save: true,
            auto_save_interval: 5000,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollaborationSession {
    pub id: String,
    pub workflow_id: String,
    pub name: String,
    pub owner: String,
    pub collaborators: Vec<Collaborator>,
    pub created_at: String,
    pub is_active: bool,
    pub settings: SessionSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub session_id: String,
    pub user_id: String,
    pub user_name: String,
    pub content: String,
    pub timestamp: String,
    pub reply_to_id: Option<String>,
    pub reactions: HashMap<String, Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollaborationEvent {
    pub id: String,
    pub event_type: String,
    pub session_id: String,
    pub user_id: String,
    pub timestamp: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollaborationInvite {
    pub id: String,
    pub session_id: String,
    pub invited_by: String,
    pub invited_email: Option<String>,
    pub role: CollaboratorRole,
    pub expires_at: String,
    pub status: String,
}

// ========== State ==========

const CURSOR_COLORS: &[&str] = &[
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
    "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
    "#BB8FCE", "#85C1E9", "#F8B500", "#00CED1",
];

pub struct CollaborationState {
    sessions: RwLock<HashMap<String, CollaborationSession>>,
    chat_history: RwLock<HashMap<String, Vec<ChatMessage>>>,
    events: RwLock<HashMap<String, Vec<CollaborationEvent>>>,
    invites: RwLock<HashMap<String, CollaborationInvite>>,
}

impl Default for CollaborationState {
    fn default() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            chat_history: RwLock::new(HashMap::new()),
            events: RwLock::new(HashMap::new()),
            invites: RwLock::new(HashMap::new()),
        }
    }
}

impl CollaborationState {
    fn emit_event(
        &self,
        events: &mut Vec<CollaborationEvent>,
        event_type: &str,
        session_id: &str,
        user_id: &str,
        payload: serde_json::Value,
    ) {
        let event = CollaborationEvent {
            id: uuid::Uuid::new_v4().to_string(),
            event_type: event_type.to_string(),
            session_id: session_id.to_string(),
            user_id: user_id.to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
            payload,
        };
        events.push(event);
        if events.len() > 500 {
            events.drain(0..250);
        }
    }

    fn get_next_color(&self, collaborator_count: usize) -> String {
        CURSOR_COLORS[collaborator_count % CURSOR_COLORS.len()].to_string()
    }
}

// ========== Commands ==========

/// Create a new collaboration session
#[tauri::command]
pub async fn collab_create_session(
    workflow_id: String,
    name: String,
    user_id: String,
    user_name: String,
    settings: Option<SessionSettings>,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<CollaborationSession, String> {
    let now = chrono::Utc::now().to_rfc3339();
    let session_id = uuid::Uuid::new_v4().to_string();

    let owner = Collaborator {
        id: user_id.clone(),
        name: user_name.clone(),
        color: state.get_next_color(0),
        is_online: true,
        last_active: now.clone(),
        role: CollaboratorRole::Owner,
        cursor: None,
        selection: Vec::new(),
    };

    let session = CollaborationSession {
        id: session_id.clone(),
        workflow_id,
        name,
        owner: user_id.clone(),
        collaborators: vec![owner],
        created_at: now,
        is_active: true,
        settings: settings.unwrap_or_default(),
    };

    let mut sessions = state.sessions.write().await;
    sessions.insert(session_id.clone(), session.clone());

    // Initialize chat and events for this session
    let mut chat = state.chat_history.write().await;
    chat.insert(session_id.clone(), Vec::new());

    let mut events = state.events.write().await;
    let mut session_events = Vec::new();
    state.emit_event(
        &mut session_events,
        "session_created",
        &session_id,
        &user_id,
        serde_json::json!({ "user_name": user_name }),
    );
    events.insert(session_id, session_events);

    Ok(session)
}

/// Join an existing session
#[tauri::command]
pub async fn collab_join_session(
    session_id: String,
    user_id: String,
    user_name: String,
    role: Option<CollaboratorRole>,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<CollaborationSession, String> {
    let mut sessions = state.sessions.write().await;
    let session = sessions.get_mut(&session_id).ok_or("Session not found")?;

    // Check if session is active
    if !session.is_active {
        return Err("Session is not active".to_string());
    }

    // Check max collaborators
    if session.collaborators.len() >= session.settings.max_collaborators {
        return Err("Session is full".to_string());
    }

    // Check if already in session
    if session.collaborators.iter().any(|c| c.id == user_id) {
        // Update online status
        if let Some(c) = session.collaborators.iter_mut().find(|c| c.id == user_id) {
            c.is_online = true;
            c.last_active = chrono::Utc::now().to_rfc3339();
        }
        return Ok(session.clone());
    }

    let collaborator = Collaborator {
        id: user_id.clone(),
        name: user_name.clone(),
        color: state.get_next_color(session.collaborators.len()),
        is_online: true,
        last_active: chrono::Utc::now().to_rfc3339(),
        role: role.unwrap_or(CollaboratorRole::Editor),
        cursor: None,
        selection: Vec::new(),
    };

    session.collaborators.push(collaborator);

    // Emit event
    let mut events = state.events.write().await;
    if let Some(session_events) = events.get_mut(&session_id) {
        state.emit_event(
            session_events,
            "user_joined",
            &session_id,
            &user_id,
            serde_json::json!({ "user_name": user_name }),
        );
    }

    Ok(session.clone())
}

/// Leave a session
#[tauri::command]
pub async fn collab_leave_session(
    session_id: String,
    user_id: String,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<bool, String> {
    let mut sessions = state.sessions.write().await;
    let session = sessions.get_mut(&session_id).ok_or("Session not found")?;

    // Mark as offline (don't remove completely)
    if let Some(collaborator) = session.collaborators.iter_mut().find(|c| c.id == user_id) {
        collaborator.is_online = false;
        collaborator.last_active = chrono::Utc::now().to_rfc3339();
    }

    // If owner and no one else online, deactivate session
    if session.owner == user_id {
        let online_count = session.collaborators.iter().filter(|c| c.is_online).count();
        if online_count == 0 {
            session.is_active = false;
        }
    }

    // Emit event
    let mut events = state.events.write().await;
    if let Some(session_events) = events.get_mut(&session_id) {
        state.emit_event(
            session_events,
            "user_left",
            &session_id,
            &user_id,
            serde_json::json!({}),
        );
    }

    Ok(true)
}

/// Get session by ID
#[tauri::command]
pub async fn collab_get_session(
    session_id: String,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<Option<CollaborationSession>, String> {
    let sessions = state.sessions.read().await;
    Ok(sessions.get(&session_id).cloned())
}

/// List all active sessions
#[tauri::command]
pub async fn collab_list_sessions(
    state: State<'_, Arc<CollaborationState>>,
) -> Result<Vec<CollaborationSession>, String> {
    let sessions = state.sessions.read().await;
    Ok(sessions.values().filter(|s| s.is_active).cloned().collect())
}

/// Update cursor position
#[tauri::command]
pub async fn collab_update_cursor(
    session_id: String,
    user_id: String,
    cursor: CursorPosition,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<bool, String> {
    let mut sessions = state.sessions.write().await;
    let session = sessions.get_mut(&session_id).ok_or("Session not found")?;

    if let Some(collaborator) = session.collaborators.iter_mut().find(|c| c.id == user_id) {
        collaborator.cursor = Some(cursor.clone());
        collaborator.last_active = chrono::Utc::now().to_rfc3339();
    }

    // Emit cursor event
    let mut events = state.events.write().await;
    if let Some(session_events) = events.get_mut(&session_id) {
        state.emit_event(
            session_events,
            "cursor_moved",
            &session_id,
            &user_id,
            serde_json::to_value(&cursor).unwrap(),
        );
    }

    Ok(true)
}

/// Update selection
#[tauri::command]
pub async fn collab_update_selection(
    session_id: String,
    user_id: String,
    node_ids: Vec<String>,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<bool, String> {
    let mut sessions = state.sessions.write().await;
    let session = sessions.get_mut(&session_id).ok_or("Session not found")?;

    if let Some(collaborator) = session.collaborators.iter_mut().find(|c| c.id == user_id) {
        collaborator.selection = node_ids.clone();
        collaborator.last_active = chrono::Utc::now().to_rfc3339();
    }

    // Emit selection event
    let mut events = state.events.write().await;
    if let Some(session_events) = events.get_mut(&session_id) {
        state.emit_event(
            session_events,
            "selection_changed",
            &session_id,
            &user_id,
            serde_json::json!({ "node_ids": node_ids }),
        );
    }

    Ok(true)
}

/// Send chat message
#[tauri::command]
pub async fn collab_send_message(
    session_id: String,
    user_id: String,
    user_name: String,
    content: String,
    reply_to_id: Option<String>,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<ChatMessage, String> {
    let message = ChatMessage {
        id: uuid::Uuid::new_v4().to_string(),
        session_id: session_id.clone(),
        user_id: user_id.clone(),
        user_name,
        content,
        timestamp: chrono::Utc::now().to_rfc3339(),
        reply_to_id,
        reactions: HashMap::new(),
    };

    let mut chat = state.chat_history.write().await;
    let history = chat.entry(session_id.clone()).or_insert_with(Vec::new);
    history.push(message.clone());

    // Emit chat event
    let mut events = state.events.write().await;
    if let Some(session_events) = events.get_mut(&session_id) {
        state.emit_event(
            session_events,
            "chat_message",
            &session_id,
            &user_id,
            serde_json::to_value(&message).unwrap(),
        );
    }

    Ok(message)
}

/// Get chat history
#[tauri::command]
pub async fn collab_get_chat_history(
    session_id: String,
    limit: Option<usize>,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<Vec<ChatMessage>, String> {
    let chat = state.chat_history.read().await;
    let history = chat.get(&session_id).cloned().unwrap_or_default();
    let limit = limit.unwrap_or(50);
    let start = history.len().saturating_sub(limit);
    Ok(history[start..].to_vec())
}

/// Add reaction to message
#[tauri::command]
pub async fn collab_add_reaction(
    session_id: String,
    message_id: String,
    user_id: String,
    emoji: String,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<bool, String> {
    let mut chat = state.chat_history.write().await;
    let history = chat.get_mut(&session_id).ok_or("Session not found")?;

    if let Some(message) = history.iter_mut().find(|m| m.id == message_id) {
        let users = message.reactions.entry(emoji).or_insert_with(Vec::new);
        if !users.contains(&user_id) {
            users.push(user_id);
        }
        Ok(true)
    } else {
        Err("Message not found".to_string())
    }
}

/// Remove reaction from message
#[tauri::command]
pub async fn collab_remove_reaction(
    session_id: String,
    message_id: String,
    user_id: String,
    emoji: String,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<bool, String> {
    let mut chat = state.chat_history.write().await;
    let history = chat.get_mut(&session_id).ok_or("Session not found")?;

    if let Some(message) = history.iter_mut().find(|m| m.id == message_id) {
        if let Some(users) = message.reactions.get_mut(&emoji) {
            users.retain(|u| u != &user_id);
        }
        Ok(true)
    } else {
        Err("Message not found".to_string())
    }
}

/// Broadcast workflow change
#[tauri::command]
pub async fn collab_broadcast_change(
    session_id: String,
    user_id: String,
    change_type: String,
    payload: serde_json::Value,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<bool, String> {
    // Verify session and permissions
    let sessions = state.sessions.read().await;
    let session = sessions.get(&session_id).ok_or("Session not found")?;

    let collaborator = session.collaborators.iter().find(|c| c.id == user_id);
    if collaborator.is_none() {
        return Err("User not in session".to_string());
    }

    let role = &collaborator.unwrap().role;
    if !session.settings.allow_editing && !matches!(role, CollaboratorRole::Owner) {
        return Err("Editing not allowed".to_string());
    }

    drop(sessions);

    // Emit change event
    let mut events = state.events.write().await;
    if let Some(session_events) = events.get_mut(&session_id) {
        state.emit_event(
            session_events,
            &change_type,
            &session_id,
            &user_id,
            payload,
        );
    }

    Ok(true)
}

/// Get session events
#[tauri::command]
pub async fn collab_get_events(
    session_id: String,
    since_timestamp: Option<String>,
    limit: Option<usize>,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<Vec<CollaborationEvent>, String> {
    let events = state.events.read().await;
    let session_events = events.get(&session_id).cloned().unwrap_or_default();

    let filtered: Vec<CollaborationEvent> = if let Some(since) = since_timestamp {
        session_events
            .into_iter()
            .filter(|e| e.timestamp > since)
            .collect()
    } else {
        session_events
    };

    let limit = limit.unwrap_or(100);
    let start = filtered.len().saturating_sub(limit);
    Ok(filtered[start..].to_vec())
}

/// Create invite link
#[tauri::command]
pub async fn collab_create_invite(
    session_id: String,
    user_id: String,
    role: CollaboratorRole,
    expires_hours: Option<u64>,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<CollaborationInvite, String> {
    // Verify session and permissions
    let sessions = state.sessions.read().await;
    let session = sessions.get(&session_id).ok_or("Session not found")?;

    let collaborator = session.collaborators.iter().find(|c| c.id == user_id);
    if collaborator.is_none() {
        return Err("User not in session".to_string());
    }

    let user_role = &collaborator.unwrap().role;
    if matches!(user_role, CollaboratorRole::Viewer) {
        return Err("Viewers cannot invite".to_string());
    }

    if !session.settings.allow_invite && !matches!(user_role, CollaboratorRole::Owner) {
        return Err("Invites not allowed".to_string());
    }

    drop(sessions);

    let hours = expires_hours.unwrap_or(24);
    let expires_at = chrono::Utc::now() + chrono::Duration::hours(hours as i64);

    let invite = CollaborationInvite {
        id: uuid::Uuid::new_v4().to_string(),
        session_id,
        invited_by: user_id,
        invited_email: None,
        role,
        expires_at: expires_at.to_rfc3339(),
        status: "pending".to_string(),
    };

    let mut invites = state.invites.write().await;
    invites.insert(invite.id.clone(), invite.clone());

    Ok(invite)
}

/// Get invite by ID
#[tauri::command]
pub async fn collab_get_invite(
    invite_id: String,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<Option<CollaborationInvite>, String> {
    let invites = state.invites.read().await;
    Ok(invites.get(&invite_id).cloned())
}

/// Accept invite
#[tauri::command]
pub async fn collab_accept_invite(
    invite_id: String,
    user_id: String,
    user_name: String,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<CollaborationSession, String> {
    let mut invites = state.invites.write().await;
    let invite = invites.get_mut(&invite_id).ok_or("Invite not found")?;

    // Check if expired
    let expires = chrono::DateTime::parse_from_rfc3339(&invite.expires_at)
        .map_err(|_| "Invalid expiry date")?;
    if chrono::Utc::now() > expires {
        invite.status = "expired".to_string();
        return Err("Invite has expired".to_string());
    }

    if invite.status != "pending" {
        return Err(format!("Invite is {}", invite.status));
    }

    invite.status = "accepted".to_string();
    let session_id = invite.session_id.clone();
    let role = invite.role.clone();

    drop(invites);

    // Join the session
    collab_join_session(session_id, user_id, user_name, Some(role), state).await
}

/// Update session settings
#[tauri::command]
pub async fn collab_update_settings(
    session_id: String,
    user_id: String,
    settings: SessionSettings,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<bool, String> {
    let mut sessions = state.sessions.write().await;
    let session = sessions.get_mut(&session_id).ok_or("Session not found")?;

    // Only owner can update settings
    if session.owner != user_id {
        return Err("Only owner can update settings".to_string());
    }

    session.settings = settings;
    Ok(true)
}

/// Heartbeat to keep online status
#[tauri::command]
pub async fn collab_heartbeat(
    session_id: String,
    user_id: String,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<Vec<Collaborator>, String> {
    let mut sessions = state.sessions.write().await;
    let session = sessions.get_mut(&session_id).ok_or("Session not found")?;

    let now = chrono::Utc::now();
    let now_str = now.to_rfc3339();

    // Update user's last active
    if let Some(collaborator) = session.collaborators.iter_mut().find(|c| c.id == user_id) {
        collaborator.last_active = now_str.clone();
        collaborator.is_online = true;
    }

    // Mark stale collaborators as offline (30s timeout)
    for collaborator in session.collaborators.iter_mut() {
        if collaborator.id != user_id {
            if let Ok(last_active) = chrono::DateTime::parse_from_rfc3339(&collaborator.last_active) {
                let elapsed = now.signed_duration_since(last_active);
                if elapsed.num_seconds() > 30 {
                    collaborator.is_online = false;
                }
            }
        }
    }

    Ok(session.collaborators.iter().filter(|c| c.is_online).cloned().collect())
}

/// Close session
#[tauri::command]
pub async fn collab_close_session(
    session_id: String,
    user_id: String,
    state: State<'_, Arc<CollaborationState>>,
) -> Result<bool, String> {
    let mut sessions = state.sessions.write().await;
    let session = sessions.get_mut(&session_id).ok_or("Session not found")?;

    // Only owner can close
    if session.owner != user_id {
        return Err("Only owner can close session".to_string());
    }

    session.is_active = false;

    // Emit close event
    let mut events = state.events.write().await;
    if let Some(session_events) = events.get_mut(&session_id) {
        state.emit_event(
            session_events,
            "session_closed",
            &session_id,
            &user_id,
            serde_json::json!({}),
        );
    }

    Ok(true)
}

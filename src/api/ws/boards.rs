use std::{
    collections::HashSet,
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    Extension,
    body::Bytes,
    extract::{
        Path, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
};
use chrono::Utc;
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::sync::watch;
use uuid::Uuid;
use yrs::{
    ReadTxn, StateVector, Transact,
    block::ClientID,
    sync::awareness::AwarenessUpdate,
    updates::{decoder::Decode, encoder::Encode},
};
use std::sync::atomic::Ordering;
use tracing::Instrument;

use crate::{
    app::state::AppState,
    auth::middleware::AuthUser,
    error::AppError,
    models::{
        boards::BoardPermissions,
        presence::{PresenceStatus, PresenceUser},
    },
    realtime::{protocol, room, snapshot},
    repositories::boards as board_repo,
    telemetry::{REQUEST_ID_HEADER, TRACE_ID_HEADER, extract_header, extract_or_generate_header},
    usecases::boards::BoardService,
    usecases::presence::PresenceService,
};

const MAX_CONCURRENT_USERS: i64 = 100;
const PRESENCE_CLEANUP_INTERVAL_MS: u64 = 60_000;

#[derive(Debug, Deserialize)]
struct ClientEvent {
    #[serde(rename = "type")]
    event_type: String,
    payload: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct PresenceUpdatePayload {
    status: String,
    metadata: Option<serde_json::Value>,
}

fn build_text_message<T: Serialize>(event_type: &str, payload: T) -> Option<Message> {
    let value = json!({ "type": event_type, "payload": payload });
    match serde_json::to_string(&value) {
        Ok(text) => Some(Message::Text(text.into())),
        Err(error) => {
            tracing::warn!("Failed to serialize ws event {}: {}", event_type, error);
            None
        }
    }
}

async fn wait_for_join(join_rx: &mut watch::Receiver<bool>) -> bool {
    if *join_rx.borrow() {
        return true;
    }
    while join_rx.changed().await.is_ok() {
        if *join_rx.borrow() {
            return true;
        }
    }
    false
}

fn presence_user_payload(user: &PresenceUser) -> serde_json::Value {
    json!({
        "user_id": user.user_id,
        "display_name": user.display_name,
        "avatar_url": user.avatar_url,
        "status": user.status,
    })
}

fn op_name(op_code: u8) -> &'static str {
    match op_code {
        protocol::OP_SYNCSTEP_1 => "syncstep_1",
        protocol::OP_SYNCSTEP_2 => "syncstep_2",
        protocol::OP_UPDATE => "update",
        protocol::OP_AWARENESS => "awareness",
        protocol::OP_ROLE_UPDATE => "role_update",
        _ => "unknown",
    }
}

fn log_ws_message_sample_rate() -> u64 {
    std::env::var("WS_MESSAGE_LOG_SAMPLE_RATE")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .unwrap_or(100)
}

fn log_ws_message(direction: &str, message: &Message) {
    if !tracing::enabled!(target: "ws_message", tracing::Level::DEBUG) {
        return;
    }
    static LOG_COUNTER: std::sync::atomic::AtomicU64 =
        std::sync::atomic::AtomicU64::new(0);
    let sample_rate = log_ws_message_sample_rate();
    let current = LOG_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    if current % sample_rate != 0 {
        return;
    }
    match message {
        Message::Binary(bin) => {
            let (op_code, op_label) = bin
                .first()
                .map(|byte| (Some(*byte), op_name(*byte)))
                .unwrap_or((None, "empty"));
            tracing::debug!(
                target: "ws_message",
                direction = direction,
                message_type = "binary",
                op_code = ?op_code.map(u64::from),
                op_name = op_label,
                bytes = bin.len(),
                "WebSocket binary message"
            );
        }
        Message::Text(text) => {
            let event_type = serde_json::from_str::<ClientEvent>(text)
                .map(|event| event.event_type)
                .unwrap_or_else(|_| "unknown".to_string());
            tracing::debug!(
                target: "ws_message",
                direction = direction,
                message_type = "text",
                event_type = %event_type,
                bytes = text.len(),
                "WebSocket text message"
            );
        }
        Message::Ping(payload) => {
            tracing::debug!(
                target: "ws_message",
                direction = direction,
                message_type = "ping",
                bytes = payload.len(),
                "WebSocket ping"
            );
        }
        Message::Pong(payload) => {
            tracing::debug!(
                target: "ws_message",
                direction = direction,
                message_type = "pong",
                bytes = payload.len(),
                "WebSocket pong"
            );
        }
        Message::Close(frame) => {
            let reason = frame
                .as_ref()
                .map(|inner| inner.reason.to_string())
                .unwrap_or_else(|| "client_close".to_string());
            tracing::debug!(
                target: "ws_message",
                direction = direction,
                message_type = "close",
                reason = %reason,
                "WebSocket close"
            );
        }
    }
}

fn should_emit_user_left(
    active_session: Result<bool, AppError>,
    board_id: Uuid,
    user_id: Uuid,
) -> bool {
    match active_session {
        Ok(is_active) => !is_active,
        Err(error) => {
            tracing::warn!(
                "Failed to verify active sessions for user {} on board {}: {}",
                user_id,
                board_id,
                error
            );
            false
        }
    }
}

pub async fn ws_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<Uuid>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    let user_id = auth_user.user_id;
    let permissions = match BoardService::get_access_permissions(&state.db, board_id, user_id).await
    {
        Ok(permissions) => permissions,
        Err(AppError::Forbidden(message)) => {
            return (StatusCode::FORBIDDEN, message).into_response();
        }
        Err(AppError::NotFound(message)) => {
            return (StatusCode::NOT_FOUND, message).into_response();
        }
        Err(AppError::BoardArchived(message)) => {
            return (StatusCode::GONE, message).into_response();
        }
        Err(AppError::BoardDeleted(message)) => {
            return (StatusCode::GONE, message).into_response();
        }
        Err(error) => {
            tracing::error!(
                "Failed to load board role for board {} and user {}: {}",
                board_id,
                user_id,
                error
            );
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to authorize board access",
            )
                .into_response();
        }
    };
    let board_name = match board_repo::find_board_by_id(&state.db, board_id).await {
        Ok(Some(board)) => board.name,
        Ok(None) => {
            return (StatusCode::NOT_FOUND, "Board not found").into_response();
        }
        Err(error) => {
            tracing::error!("Failed to load board {}: {}", board_id, error);
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to load board",
            )
                .into_response();
        }
    };
    let room = room::get_or_load_room(&state.rooms, &state.db, board_id).await;
    let room = match room {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("Failed to get or load board {}: {}", board_id, e);
            return axum::response::Response::builder()
                .status(500)
                .body(format!("Failed to load board: {}", e).into())
                .unwrap();
        }
    };

    let request_id = extract_or_generate_header(&headers, REQUEST_ID_HEADER);
    let trace_id = extract_header(&headers, TRACE_ID_HEADER).unwrap_or_else(|| request_id.clone());

    ws.on_upgrade(move |socket| {
        handle_socket(
            socket,
            state.db.clone(),
            state.redis.clone(),
            board_id,
            board_name,
            user_id,
            permissions,
            room,
            request_id,
            trace_id,
        )
    })
}

pub async fn handle_socket(
    socket: WebSocket,
    db: sqlx::PgPool,
    redis: Option<redis::Client>,
    board_id: Uuid,
    board_name: String,
    user_id: Uuid,
    permissions: BoardPermissions,
    room: Arc<room::Room>,
    request_id: String,
    trace_id: String,
) {
    let can_edit = permissions.can_edit;
    let (sender, mut receiver) = socket.split();
    let (out_tx, mut out_rx) = tokio::sync::mpsc::unbounded_channel::<Message>();
    let (join_tx, join_rx) = watch::channel(false);
    let mut rx = room.tx.subscribe();
    let mut text_rx = room.text_tx.subscribe();
    let session_id = Uuid::now_v7();

    let connection_span = tracing::info_span!(
        "ws_connection",
        board_id = %board_id,
        user_id = %user_id,
        session_id = %session_id,
        request_id = %request_id,
        trace_id = %trace_id
    );
    tracing::info!(parent: &connection_span, "WebSocket connected");

    let mut write_task = tokio::spawn(async move {
        let mut sender = sender;
        while let Some(msg) = out_rx.recv().await {
            log_ws_message("outbound", &msg);
            if sender.send(msg).await.is_err() {
                tracing::warn!("Failed to send websocket message; client disconnected");
                break;
            }
        }
    }.instrument(connection_span.clone()));

    let out_tx_clone = out_tx.clone();
    let mut send_task = tokio::spawn({
        let join_rx = join_rx.clone();
        async move {
            let mut join_rx = join_rx;
            if !wait_for_join(&mut join_rx).await {
                return;
            }
            while let Ok(msg) = rx.recv().await {
                if out_tx_clone.send(Message::Binary(msg)).is_err() {
                    break;
                }
            }
        }
    }.instrument(connection_span.clone()));

    let out_tx_text = out_tx.clone();
    let mut text_task = tokio::spawn({
        let join_rx = join_rx.clone();
        async move {
            let mut join_rx = join_rx;
            if !wait_for_join(&mut join_rx).await {
                return;
            }
            while let Ok(msg) = text_rx.recv().await {
                if out_tx_text.send(Message::Text(msg.into())).is_err() {
                    break;
                }
            }
        }
    }.instrument(connection_span.clone()));

    let room_cleanup = room.clone();
    let db_cleanup = db.clone();
    let redis_cleanup = redis.clone();
    let mut cleanup_task = tokio::spawn({
        let join_rx = join_rx.clone();
        async move {
            let mut join_rx = join_rx;
            if !wait_for_join(&mut join_rx).await {
                return;
            }
            let mut ticker =
                tokio::time::interval(Duration::from_millis(PRESENCE_CLEANUP_INTERVAL_MS));
            ticker.tick().await;
            loop {
                ticker.tick().await;
                let users = PresenceService::cleanup_stale_sessions(
                    &db_cleanup,
                    redis_cleanup.as_ref(),
                    board_id,
                )
                .await
                .unwrap_or_default();
                if users.is_empty() {
                    continue;
                }
                for stale_user_id in users {
                    if let Some(Message::Text(text)) = build_text_message(
                        "user:left",
                        json!({
                            "user_id": stale_user_id,
                            "reason": "timeout",
                            "timestamp": Utc::now().timestamp_millis(),
                        }),
                    ) {
                        let _ = room_cleanup.text_tx.send(text.to_string());
                    }
                }
            }
        }
    }.instrument(connection_span.clone()));

    let room_clone = room.clone();
    let out_tx_recv = out_tx.clone();
    let redis_clone = redis.clone();
    let mut recv_task = tokio::spawn(async move {
        let connection_id = Some(session_id.to_string());
        let mut awareness_clients: HashSet<ClientID> = HashSet::new();
        let mut close_reason: Option<String> = None;
        let already_active = PresenceService::has_active_session(&db, board_id, user_id)
            .await
            .unwrap_or(false);
        let active_count = PresenceService::count_active_users(&db, board_id)
            .await
            .unwrap_or(0);

        if active_count >= MAX_CONCURRENT_USERS && !already_active {
            let (notify, position) = room_clone.enqueue_session(session_id, user_id).await;
            if let Some(msg) = build_text_message(
                "board:queued",
                json!({
                    "board_id": board_id,
                    "position": position,
                }),
            ) {
                let _ = out_tx_recv.send(msg);
            }

            loop {
                tokio::select! {
                    _ = notify.notified() => {
                        break;
                    }
                    message = receiver.next() => {
                        match message {
                            Some(Ok(Message::Close(_))) | None => {
                                room_clone.remove_queued_session(session_id).await;
                                return;
                            }
                            _ => {}
                        }
                    }
                }
            }
        }

        if let Err(error) = PresenceService::join(
            &db,
            redis_clone.as_ref(),
            board_id,
            user_id,
            session_id,
            connection_id,
        )
        .await
        {
            tracing::error!(
                "Failed to create presence for user {} on board {}: {}",
                user_id,
                board_id,
                error
            );
            return;
        }
        tracing::info!("WebSocket presence joined");

        {
            let sessions = room_clone.sessions.write().await;
            sessions.insert(session_id);
            *room_clone.last_active.lock().await = Instant::now();
        }
        room_clone.edit_permissions.insert(user_id, can_edit);
        let _ = join_tx.send(true);

        let (msg1, msg2) = {
            let doc_guard = room_clone.doc.lock().await;
            let txn = doc_guard.transact();

            let sv = txn.state_vector().encode_v1();
            let mut msg = vec![protocol::OP_SYNCSTEP_1];
            msg.extend(sv);

            let update = txn.encode_state_as_update_v1(&StateVector::default());
            let mut msg2 = vec![protocol::OP_SYNCSTEP_2];
            msg2.extend(update);
            (msg, msg2)
        };

        let _ = out_tx_recv.send(Message::Binary(Bytes::from(msg1)));
        let _ = out_tx_recv.send(Message::Binary(Bytes::from(msg2)));

        let stale_users =
            PresenceService::cleanup_stale_sessions(&db, redis_clone.as_ref(), board_id)
                .await
                .unwrap_or_default();
        if !stale_users.is_empty() {
            for stale_user_id in stale_users {
                if let Some(Message::Text(text)) = build_text_message(
                    "user:left",
                    json!({
                        "user_id": stale_user_id,
                        "reason": "timeout",
                        "timestamp": Utc::now().timestamp_millis(),
                    }),
                ) {
                    let _ = room_clone.text_tx.send(text.to_string());
                }
            }
        }

        let current_users =
            PresenceService::list_active_users(&db, redis_clone.as_ref(), board_id)
                .await
                .unwrap_or_default();
        if let Some(msg) = build_text_message(
            "board:joined",
            json!({
                "board_id": board_id,
                "board_name": board_name,
                "session_id": session_id,
                "current_users": current_users
                    .iter()
                    .filter(|user| user.status.is_visible())
                    .map(presence_user_payload)
                    .collect::<Vec<_>>(),
                "permissions": {
                    "can_edit": permissions.can_edit,
                    "can_comment": permissions.can_comment,
                    "can_share": permissions.can_manage_members || permissions.can_manage_board,
                }
            }),
        ) {
            let _ = out_tx_recv.send(msg);
        }

        if let Some(joined_user) = current_users.iter().find(|user| user.user_id == user_id) {
            if let Some(Message::Text(text)) = build_text_message(
                "user:joined",
                json!({
                    "user": presence_user_payload(joined_user),
                    "timestamp": Utc::now().timestamp_millis(),
                }),
            ) {
                let _ = room_clone.text_tx.send(text.to_string());
            }
        }

        while let Some(Ok(message)) = receiver.next().await {
            *room_clone.last_active.lock().await = Instant::now();
            match message {
                Message::Binary(bin) => {
                    log_ws_message("inbound", &Message::Binary(bin.clone()));
                    if bin.is_empty() {
                        continue;
                    }
                    let prefix = bin[0];
                    let payload = &bin[1..];
                    match prefix {
                        protocol::OP_SYNCSTEP_1 => {
                            let doc_guard = room_clone.doc.lock().await;
                            let txn = doc_guard.transact_mut();
                            if let Ok(sv) = StateVector::decode_v1(payload) {
                                let update = txn.encode_state_as_update_v1(&sv);
                                let mut msg = vec![protocol::OP_UPDATE];
                                msg.extend(update);
                                let _ = out_tx_recv.send(Message::Binary(Bytes::from(msg)));
                            }
                        }
                        protocol::OP_SYNCSTEP_2 => {}
                        protocol::OP_UPDATE => {
                            let can_edit = room_clone
                                .edit_permissions
                                .get(&user_id)
                                .map(|entry| *entry)
                                .unwrap_or(false);
                            if !can_edit {
                                tracing::info!(
                                    "Ignoring board update from read-only user {} on board {}",
                                    user_id,
                                    board_id
                                );
                                continue;
                            }
                            let doc_guard = room_clone.doc.lock().await;
                            let mut txn = doc_guard.transact_mut();
                            if let Ok(update) = Decode::decode_v1(payload) {
                                txn.apply_update(update).unwrap_or_else(|e| {
                                    tracing::warn!(
                                        "Failed to apply update from client {}: {}",
                                        user_id,
                                        e
                                    );
                                });
                            }
                            room_clone.projection_seq.fetch_add(1, Ordering::Relaxed);
                            let mut pending = room_clone.pending_updates.lock().await;
                            pending.push(payload.to_vec());
                            room_clone
                                .pending_update_count
                                .fetch_add(1, Ordering::Relaxed);
                        }
                        protocol::OP_AWARENESS => match AwarenessUpdate::decode_v1(payload) {
                            Ok(update) => {
                                awareness_clients.extend(update.clients.keys().copied());
                                let awareness = room_clone.awareness.write().await;
                                awareness.apply_update(update).unwrap_or_else(|e| {
                                    tracing::warn!(
                                        "Failed to apply awareness update from client {}: {}",
                                        user_id,
                                        e
                                    );
                                });
                            }
                            Err(e) => {
                                tracing::warn!(
                                    "Failed to decode awareness update from client {}: {}",
                                    user_id,
                                    e
                                );
                            }
                        },
                        _ => {}
                    }

                    let _ = room_clone.tx.send(bin);
                }
                Message::Text(text) => {
                    let Ok(event) = serde_json::from_str::<ClientEvent>(&text) else {
                        tracing::warn!("Failed to parse websocket text message");
                        continue;
                    };
                    tracing::info!(
                        target: "ws_message",
                        direction = "inbound",
                        message_type = "text",
                        event_type = %event.event_type,
                        bytes = text.len(),
                        "WebSocket text message"
                    );
                    match event.event_type.as_str() {
                        "heartbeat" => {
                            if PresenceService::heartbeat(&db, board_id, session_id)
                                .await
                                .is_ok()
                            {
                                if let Some(msg) =
                                    build_text_message("heartbeat:ack", json!({"server_time": Utc::now().timestamp_millis()}))
                                {
                                    let _ = out_tx_recv.send(msg);
                                }
                            }
                        }
                        "presence:update" => {
                            let Some(payload) = event.payload else {
                                continue;
                            };
                            let Ok(payload) =
                                serde_json::from_value::<PresenceUpdatePayload>(payload)
                            else {
                                continue;
                            };
                            let Some(status) =
                                PresenceStatus::normalize_client(payload.status.as_str())
                            else {
                                continue;
                            };
                            if PresenceService::update_status(
                                &db,
                                redis_clone.as_ref(),
                                board_id,
                                session_id,
                                status,
                            )
                            .await
                            .is_ok()
                            {
                                if let Some(Message::Text(text)) = build_text_message(
                                    "presence:update",
                                    json!({
                                        "user_id": user_id,
                                        "status": status,
                                        "metadata": payload.metadata,
                                        "timestamp": Utc::now().timestamp_millis(),
                                    }),
                                ) {
                                    let _ = room_clone.text_tx.send(text.to_string());
                                }
                            }
                        }
                        _ => {}
                    }
                }
                Message::Close(frame) => {
                    close_reason = frame
                        .as_ref()
                        .map(|inner| inner.reason.to_string())
                        .or_else(|| Some("client_close".to_string()));
                    log_ws_message("inbound", &Message::Close(frame));
                    break;
                }
                Message::Ping(payload) => {
                    log_ws_message("inbound", &Message::Ping(payload));
                }
                Message::Pong(payload) => {
                    log_ws_message("inbound", &Message::Pong(payload));
                }
            }
        }

        if !awareness_clients.is_empty() {
            let update = {
                let awareness = room_clone.awareness.write().await;
                for client_id in &awareness_clients {
                    awareness.remove_state(*client_id);
                }
                awareness
                    .update_with_clients(awareness_clients.iter().copied())
                    .map_err(|error| {
                        tracing::warn!(
                            "Failed to build awareness removal update for user {}: {}",
                            user_id,
                            error
                        );
                    })
                    .ok()
            };

            if let Some(update) = update {
                let mut msg = vec![protocol::OP_AWARENESS];
                msg.extend(update.encode_v1());
                let _ = room_clone.tx.send(Bytes::from(msg));
            }
        }

        {
            let sessions = room_clone.sessions.write().await;
            sessions.remove(&session_id);
            room_clone.edit_permissions.remove(&user_id);
            *room_clone.last_active.lock().await = Instant::now();
            let remaining = sessions.len();
            tracing::info!(
                "Session {} left room {}. Remaining: {}",
                session_id,
                board_id,
                remaining
            );
            if remaining == 0 {
                let pending_updates = {
                    let mut pending = room_clone.pending_updates.lock().await;
                    if pending.is_empty() {
                        Vec::new()
                    } else {
                        pending.drain(..).collect()
                    }
                };
                if !pending_updates.is_empty() {
                    snapshot::save_update_logs(board_id, None, pending_updates, db.clone()).await;
                }
            }
        }

        if let Err(error) =
            PresenceService::disconnect(&db, redis_clone.as_ref(), board_id, session_id).await
        {
            tracing::warn!(
                "Failed to mark disconnect for user {} on board {}: {}",
                user_id,
                board_id,
                error
            );
        }
        tracing::info!(
            reason = close_reason.unwrap_or_else(|| "server_shutdown".to_string()),
            "WebSocket disconnected"
        );

        if should_emit_user_left(
            PresenceService::has_active_session(&db, board_id, user_id).await,
            board_id,
            user_id,
        ) {
            if let Some(Message::Text(text)) = build_text_message(
                "user:left",
                json!({
                    "user_id": user_id,
                    "reason": "disconnect",
                    "timestamp": Utc::now().timestamp_millis(),
                }),
            ) {
                let _ = room_clone.text_tx.send(text.to_string());
            }
        }

        if let Some(queued) = room_clone.pop_next_queued().await {
            queued.notify.notify_one();
        }
    }.instrument(connection_span.clone()));

    tokio::select! {
        _ = (&mut write_task) => {},
        _ = (&mut send_task) => {},
        _ = (&mut text_task) => {},
        _ = (&mut recv_task) => {},
        _ = (&mut cleanup_task) => {},
    }

    cleanup_task.abort();
}

#[cfg(test)]
mod tests {
    use super::should_emit_user_left;
    use crate::error::AppError;
    use uuid::Uuid;

    #[test]
    fn emits_user_left_only_when_no_active_session() {
        let board_id = Uuid::nil();
        let user_id = Uuid::nil();

        assert!(!should_emit_user_left(Ok(true), board_id, user_id));
        assert!(should_emit_user_left(Ok(false), board_id, user_id));
    }

    #[test]
    fn skips_user_left_on_presence_check_error() {
        let board_id = Uuid::nil();
        let user_id = Uuid::nil();

        assert!(!should_emit_user_left(
            Err(AppError::Internal("presence check failed".to_string())),
            board_id,
            user_id
        ));
    }
}

use std::{sync::Arc, time::Instant};

use axum::{
    Extension,
    body::Bytes,
    extract::{
        Path, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use uuid::Uuid;
use yrs::{
    ReadTxn, StateVector, Transact,
    updates::{decoder::Decode, encoder::Encode},
};

use crate::{
    app::state::AppState,
    auth::middleware::AuthUser,
    models::boards::BoardRole,
    realtime::{protocol, room},
    repositories::boards as board_repo,
};

pub async fn ws_handler(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<Uuid>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    let user_id = auth_user.user_id;
    let role = match board_repo::get_board_member_role(&state.db, board_id, user_id).await {
        Ok(Some(role)) => role,
        Ok(None) => {
            return axum::response::Response::builder()
                .status(403)
                .body("Board access denied".into())
                .unwrap();
        }
        Err(e) => {
            tracing::error!(
                "Failed to load board role for board {} and user {}: {}",
                board_id,
                user_id,
                e
            );
            return axum::response::Response::builder()
                .status(500)
                .body("Failed to authorize board access".into())
                .unwrap();
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

    ws.on_upgrade(move |socket| handle_socket(socket, board_id, user_id, role, room))
}

pub async fn handle_socket(
    socket: WebSocket,
    board_id: Uuid,
    user_id: Uuid,
    role: BoardRole,
    room: Arc<room::Room>,
) {
    let can_edit = matches!(
        role,
        BoardRole::Owner | BoardRole::Admin | BoardRole::Editor
    );
    let (sender, mut receiver) = socket.split();
    let (out_tx, mut out_rx) = tokio::sync::mpsc::unbounded_channel::<Message>();
    let mut rx = room.tx.subscribe();

    let mut write_task = tokio::spawn(async move {
        let mut sender = sender;
        while let Some(msg) = out_rx.recv().await {
            if sender.send(msg).await.is_err() {
                break;
            }
        }
    });

    let (msg1, msg2) = {
        let doc_guard = room.doc.lock().await;
        let txn = doc_guard.transact();

        let sv = txn.state_vector().encode_v1();
        let mut msg = vec![protocol::OP_SYNCSTEP_1];
        msg.extend(sv);

        let update = txn.encode_state_as_update_v1(&StateVector::default());
        let mut msg2 = vec![protocol::OP_SYNCSTEP_2];
        msg2.extend(update);
        (msg, msg2)
    };

    let _ = out_tx.send(Message::Binary(Bytes::from(msg1)));
    let _ = out_tx.send(Message::Binary(Bytes::from(msg2)));

    let out_tx_clone = out_tx.clone();
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if out_tx_clone.send(Message::Binary(msg)).is_err() {
                break;
            }
        }
    });

    let room_clone = room.clone();
    let out_tx_recv = out_tx.clone();
    let mut recv_task = tokio::spawn(async move {
        {
            let users = room_clone.user.write().await;
            users.insert(user_id);
            *room_clone.last_active.lock().await = Instant::now();
        }

        while let Some(Ok(Message::Binary(bin))) = receiver.next().await {
            if bin.is_empty() {
                continue;
            }
            *room_clone.last_active.lock().await = Instant::now();

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
                            tracing::warn!("Failed to apply update from client {}: {}", user_id, e);
                        });
                    }
                    let mut pending = room_clone.pending_updates.lock().await;
                    pending.push(payload.to_vec());
                }
                protocol::OP_AWARENESS => match Decode::decode_v1(payload) {
                    Ok(update) => {
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

        {
            let users = room_clone.user.write().await;
            users.remove(&user_id);
            *room_clone.last_active.lock().await = Instant::now();
            tracing::info!(
                "User {} left room {}. Remaining: {}",
                user_id,
                board_id,
                users.len()
            );
        }
    });

    tokio::select! {
        _ = (&mut write_task) => {},
        _ = (&mut send_task) => {},
        _ = (&mut recv_task) => {},
    }
}

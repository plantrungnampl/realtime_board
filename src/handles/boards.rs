use std::{collections::HashMap, io::Cursor, sync::Arc};

use axum::{
    Extension, Json,
    body::Bytes,
    extract::{
        Path, Query, State, WebSocketUpgrade, path,
        ws::{Message, WebSocket},
    },
    response::IntoResponse,
};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::mpsc;
use uuid::Uuid;
use yrs::{
    ReadTxn, StateVector, Transact, Update,
    updates::{
        decoder::{Decode, DecoderV1},
        encoder::Encode,
    },
};

use crate::{
    AppState, Room, Rooms,
    error::AppError,
    models::boards::{
        Board, BoardElement, BoardResponse, CreateBoardRequest, CursorBroadcast, CursorMove,
        WsBoardElementAction,
    },
    services::{
        boards::{BoardService, create_element, update_element_final},
        jwt::JwtConfig,
        middleware::AuthUser,
    },
};
pub async fn create_board_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<CreateBoardRequest>,
) -> Result<Json<Board>, AppError> {
    let user_id = auth_user.user_id;
    let board = BoardService::create_board(&state.db, req, user_id).await?;
    println!("board === {:?}", board);
    Ok(Json(board))
}
pub async fn get_board_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<Json<Vec<BoardResponse>>, AppError> {
    let user_id = auth_user.user_id;
    let board = BoardService::get_board(&state.db, user_id).await?;
    println!("board === {:?}", board);
    Ok(Json(board))
}

pub async fn get_element_handle(
    State(state): State<AppState>,
    Path(board_id): Path<Uuid>,
) -> Result<Json<Vec<BoardElement>>, AppError> {
    let elements = BoardService::get_element(&state.db, board_id).await?;
    println!("board result==: {:?}", elements);
    Ok(Json(elements))
}

pub async fn ws_handler(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<Uuid>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    let user_id = auth_user.user_id;

    ws.on_upgrade(move |socket| handle_socket(socket, board_id, user_id, state))
}
pub async fn handle_socket(socket: WebSocket, board_id: Uuid, user_id: Uuid, state: AppState) {
    // tìm phòng (rốm) nếu ko có thì tạo phòng mới với or_insert_with
    let room = state
        .rooms
        .entry(board_id.clone())
        .or_insert_with(|| Arc::new(Room::new(board_id)))
        .value()
        .clone();
    let (mut sender, mut receiver) = socket.split();
    let mut rx = room.tx.subscribe();

    // user mới vào thì phải đồng bộ dữ liệu cũ
    let (msg1, msg2) = {
        let doc_guard = room.doc.lock().await;
        let mut txn = doc_guard.transact_mut();
        // TODO: đồng bộ dữ liệu cũ
        let sv = txn.state_vector().encode_v1();
        let mut msg = vec![0, 1]; // 0: Sync , 1: step 1
        msg.extend(sv);
        // TODO: step 2 Server gửi luôn "Đây là tất cả dữ liệu tao có"
        let update = txn.encode_state_as_update_v1(&StateVector::default());
        let mut msg2 = vec![0, 2]; // 0: Sync , 2: step 2
        msg2.extend(update);
        (msg, msg2)
    };
    //init syn
    let _ = sender.send(Message::Binary(Bytes::from(msg1))).await;
    let _ = sender.send(Message::Binary(Bytes::from(msg2))).await;
    // gửi cho client -> server
    // nếu có ai vẽ gì ở phòng thì báo cho client biết
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if sender
                .send(Message::Binary(Bytes::from(msg)))
                .await
                .is_err()
            {
                break;
            }
        }
    });
    // Nhận từ client - > server
    // nếu nhận được cái gì thì báo cho người khác
    let room_clone = room.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Binary(bin))) = receiver.next().await {
            if bin.is_empty() {
                continue;
            }
            {
                // server mở hàng của client gửi về
                let doc_guard = room_clone.doc.lock().await;
                let mut txn = doc_guard.transact_mut();
                // yrs tự động merge cục binary này vào doc hiện tại
                // Nếu Client vẽ hình vuông, server doc giờ cũng có hình vuông
                let update = yrs::Update::decode_v1(&bin).unwrap();

                if let Err(e) = txn.apply_update(update) {
                    tracing::error!("Failed to apply update: {}", e)
                };
            }
            //broast cast cục binary này cho nhuwxg client khác
            let _ = room.tx.send(bin);
        }
    });
    tokio::select! {
        _ = (&mut send_task) => {},
            _ = (&mut recv_task) => {},
    }
}

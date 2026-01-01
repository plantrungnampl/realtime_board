use std::{ sync::Arc, time::{Duration, Instant}};

use axum::{
    Extension, Json,
    body::Bytes,
    extract::{
        Path,  State, WebSocketUpgrade, 
        ws::{Message, WebSocket},
    },
    response::IntoResponse,
};
use dashmap::Entry;
use futures::{SinkExt, StreamExt};

use uuid::Uuid;
use yrs::{
  ReadTxn, StateVector, Transact, updates::{
        decoder::Decode,
        encoder::Encode,
    }
};

use crate::{
    AppState, Room,
    error::AppError,
    models::boards::{
        Board, BoardElement, BoardResponse, CreateBoardRequest
    },
    services::{
        boards::{BoardService},
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
pub async fn get_or_load_board(State(state): State<AppState>,board_id: Uuid) -> Result<Arc<Room>, String> {
    //load từ ram neu co 
       if let Some(room) = state.rooms.get(&board_id) {
        return Ok(room.clone());
    } 
        //nuếu ko có thì load từ db lên
        // a. Khởi tạo Room rỗng (Tạo Doc mới, tạo Channel mới)
        let new_room = Arc::new(Room::new(board_id));
        BoardService::load_board_state(&state.db, new_room.doc.clone(), board_id).await.map_err(|e| format!("Failed to load board state: {}", e))?;
       
             match state.rooms.entry(board_id) {
            Entry::Occupied(entry) => Ok(entry.get().clone()),
            Entry::Vacant(entry) => {
                entry.insert(new_room.clone());
                Ok(new_room)
            }
        }
}



pub async fn ws_handler(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<Uuid>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    let user_id = auth_user.user_id;
    let room = get_or_load_board(State(state.clone()), board_id).await;
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
    ws.on_upgrade(move |socket| handle_socket(socket, board_id, user_id, state, room))
}
pub async fn handle_socket(socket: WebSocket, board_id: Uuid, user_id: Uuid, state: AppState, room: Arc<Room>) {
 
        let ( sender, mut receiver) = socket.split();
        // kênh để gửi nhận message giữa các client trong cùng phòng
        //tx: gửi message đến những người đăng ký (những client khác trong phòng)
        // rx: nhận message từ những người gửi (những client khác trong phòng)
        let (out_tx, mut out_rx) = tokio::sync::mpsc::unbounded_channel::<Message>();
        let mut rx = room.tx.subscribe();


        let mut write_task = tokio::spawn(async move {
            let mut sender = sender;
            while let Some(msg) = out_rx.recv().await {
                if sender.send(msg).await.is_err(){
                    break;
                }
            }
        });


    // user mới vào thì phải đồng bộ dữ liệu cũ
    let (msg1, msg2) = {
        let doc_guard = room.doc.lock().await;
        let txn = doc_guard.transact();
        //đồng bộ dữ liệu cũ
        let sv = txn.state_vector().encode_v1();
        let mut msg = vec![0, 1]; // 0: Sync , 1: step 1
        msg.extend(sv);
        //  step 2 Server gửi luôn "Đây là tất cả dữ liệu tao có"
        let update = txn.encode_state_as_update_v1(&StateVector::default());
        let mut msg2 = vec![0, 2]; // 0: Sync , 2: step 2
        msg2.extend(update);
        (msg, msg2)
    };
    //init syn
    let _ = out_tx.send(Message::Binary(Bytes::from(msg1)));
    let _ = out_tx.send(Message::Binary(Bytes::from(msg2)));
    // gửi cho client -> server
    // nếu có ai vẽ gì ở phòng thì báo cho client biết
    let out_tx_clone = out_tx.clone();
    let mut send_task = tokio::spawn(async move {
        while let Ok(msg) = rx.recv().await {
            if out_tx_clone
                .send(Message::Binary(Bytes::from(msg)))
                .is_err()
            {
                break;
            }
        }
    });
    // Task Nhận từ client - > server
    let room_clone = room.clone();
    let out_tx_recv = out_tx.clone();
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(Message::Binary(bin))) = receiver.next().await {
            if bin.is_empty() {
                continue;
            }
            const OP_SYNCSTEP_1: u8 = 0; //state vector
            const OP_SYNCSTEP_2: u8 = 1; // full update
            const OP_UPDATE: u8 = 2; // update client gửi lên yjs raw update
            const OP_AWARENESS: u8 = 3; // Dùng khi: Di chuột, bôi đen văn bản, hiện tên user online.
            let prefix = bin[0];

            let payload = &bin[1..];
            // let decode_payload  = AwarenessUpdate::decode_v1(payload);
            match prefix   {
                //sync data
                OP_SYNCSTEP_1 => {
                let doc_guard = room_clone.doc.lock().await;
                let  txn = doc_guard.transact_mut();
                // yrs tự động merge cục binary này vào doc hiện tại
                // Nếu Client vẽ hình vuông, server doc giờ cũng có hình vuông
                 if let Ok(sv) =  StateVector::decode_v1(payload) {
                    let update = txn.encode_state_as_update_v1(&sv);
                    let mut msg = vec![OP_UPDATE]; // 2: update
                    msg.extend(update);
                    let _ = out_tx_recv.send(Message::Binary(Bytes::from(msg)));
                    
                    }
               
            }
              OP_SYNCSTEP_2 => {
                    
              }
              OP_UPDATE => {
                    let doc_guard = room_clone.doc.lock().await;
                    let mut txn = doc_guard.transact_mut();
                    // yrs tự động merge cục binary này vào doc hiện tại
                    // Nếu Client vẽ hình vuông, server doc giờ cũng có hình vuông
                    if let Ok(update) = yrs::updates::decoder::Decode::decode_v1(payload) {
                        txn.apply_update(update).unwrap_or_else(|e| {
                            tracing::warn!(
                                "Failed to apply update from client {}: {}",
                                user_id,
                                e
                            );
                        });
                    }

                    let mut updates_to_save: Option<Vec<Vec<u8>>> = None;
                    {
                        let mut pending = room_clone.pending_updates.lock().await;
                        pending.push(payload.to_vec());
                        let mut last_save = room_clone.last_save.lock().await;
                        if !pending.is_empty() || pending.len() >= 50 || last_save.elapsed() > Duration::from_secs(10) {
                            updates_to_save = Some(pending.drain(..).collect());
                            *last_save = Instant::now();
                        
                        }
                    }
                    if let Some(updates) = updates_to_save {
                        let db_clone = state.db.clone();
                        tokio::spawn(async move {
                            BoardService::save_update_logs(board_id, Some(user_id), updates, db_clone).await;
                        });
                    }
                    // let mut pending = room_clone.pending_updates.lock().await;
                    // pending.push(payload.to_vec());
            }
                // awareness
                OP_AWARENESS => {
                    match yrs::updates::decoder::Decode::decode_v1(payload) {
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
                                "Failed to decode sync step 1 from client {}: {}",
                                user_id,
                                e
                            );
                        }
                    }
                    
                }
                _ => {}
            }
           
            //broast cast cục binary này cho nhuwxg client khác
            let _ = room.tx.send(bin);
        }
    });
    tokio::select! {
        _ = (&mut write_task) => {

        },
        _ = (&mut send_task) => {},
            _ = (&mut recv_task) => {
            },
    }

}

use axum::{
    Extension, Json,
    body::Bytes,
    extract::{Path, Query, State},
};

use crate::{
    app::state::AppState,
    auth::middleware::AuthUser,
    dto::boards::{
        BoardActionMessage, BoardFavoriteResponse, BoardListQuery, BoardMembersResponse,
        BoardResponse, CreateBoardRequest, InviteBoardMembersRequest, InviteBoardMembersResponse,
        TransferBoardOwnershipRequest, UpdateBoardMemberRoleRequest, UpdateBoardRequest,
    },
    error::AppError,
    models::boards::{Board, BoardPermissions, BoardRole},
    realtime::{protocol, room},
    usecases::boards::{BoardMemberChange, BoardService},
};

pub async fn create_board_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<CreateBoardRequest>,
) -> Result<Json<Board>, AppError> {
    let user_id = auth_user.user_id;
    let board = BoardService::create_board(&state.db, req, user_id).await?;
    Ok(Json(board))
}

pub async fn get_board_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Query(query): Query<BoardListQuery>,
) -> Result<Json<Vec<BoardResponse>>, AppError> {
    let user_id = auth_user.user_id;
    let board =
        BoardService::get_board(&state.db, user_id, query.organization_id, query.is_template)
            .await?;
    Ok(Json(board))
}

pub async fn get_board_detail_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<uuid::Uuid>,
) -> Result<Json<Board>, AppError> {
    let board = BoardService::get_board_detail(&state.db, board_id, auth_user.user_id).await?;
    Ok(Json(board))
}

pub async fn update_board_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<uuid::Uuid>,
    Json(req): Json<UpdateBoardRequest>,
) -> Result<Json<Board>, AppError> {
    let board = BoardService::update_board(&state.db, board_id, auth_user.user_id, req).await?;
    Ok(Json(board))
}

pub async fn archive_board_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<uuid::Uuid>,
) -> Result<Json<BoardActionMessage>, AppError> {
    let response = BoardService::archive_board(&state.db, board_id, auth_user.user_id).await?;
    Ok(Json(response))
}

pub async fn unarchive_board_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<uuid::Uuid>,
) -> Result<Json<BoardActionMessage>, AppError> {
    let response = BoardService::unarchive_board(&state.db, board_id, auth_user.user_id).await?;
    Ok(Json(response))
}

pub async fn transfer_board_ownership_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<uuid::Uuid>,
    Json(req): Json<TransferBoardOwnershipRequest>,
) -> Result<Json<BoardActionMessage>, AppError> {
    let response =
        BoardService::transfer_board_ownership(&state.db, board_id, auth_user.user_id, req).await?;
    Ok(Json(response))
}

pub async fn delete_board_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<uuid::Uuid>,
) -> Result<Json<BoardActionMessage>, AppError> {
    let response = BoardService::delete_board(&state.db, board_id, auth_user.user_id).await?;
    Ok(Json(response))
}

pub async fn restore_board_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<uuid::Uuid>,
) -> Result<Json<BoardActionMessage>, AppError> {
    let response = BoardService::restore_board(&state.db, board_id, auth_user.user_id).await?;
    Ok(Json(response))
}

pub async fn toggle_board_favorite_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<uuid::Uuid>,
) -> Result<Json<BoardFavoriteResponse>, AppError> {
    let response =
        BoardService::toggle_board_favorite(&state.db, board_id, auth_user.user_id).await?;
    Ok(Json(response))
}

pub async fn list_board_members_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<uuid::Uuid>,
) -> Result<Json<BoardMembersResponse>, AppError> {
    let response = BoardService::list_board_members(&state.db, board_id, auth_user.user_id).await?;
    Ok(Json(response))
}

pub async fn invite_board_members_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<uuid::Uuid>,
    Json(req): Json<InviteBoardMembersRequest>,
) -> Result<(axum::http::StatusCode, Json<InviteBoardMembersResponse>), AppError> {
    let response = BoardService::invite_board_members(
        &state.db,
        state.email_service.as_ref(),
        board_id,
        auth_user.user_id,
        req,
    )
    .await?;
    Ok((axum::http::StatusCode::CREATED, Json(response)))
}

pub async fn update_board_member_role_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((board_id, member_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Json(req): Json<UpdateBoardMemberRoleRequest>,
) -> Result<Json<BoardActionMessage>, AppError> {
    let result = BoardService::update_board_member_role(
        &state.db,
        board_id,
        auth_user.user_id,
        member_id,
        req,
    )
    .await?;
    apply_board_member_change(&state, board_id, &result);
    Ok(Json(result.message))
}

pub async fn remove_board_member_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((board_id, member_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<Json<BoardActionMessage>, AppError> {
    let result =
        BoardService::remove_board_member(&state.db, board_id, auth_user.user_id, member_id)
            .await?;
    apply_board_member_change(&state, board_id, &result);
    Ok(Json(result.message))
}

fn apply_board_member_change(state: &AppState, board_id: uuid::Uuid, change: &BoardMemberChange) {
    let Some(room_ref) = state.rooms.get(&board_id) else {
        return;
    };
    let room = room_ref.value().clone();
    update_room_permissions(&room, change.member_user_id, change.permissions);
    broadcast_role_update(
        &room,
        change.member_user_id,
        change.role,
        change.permissions,
    );
}

fn update_room_permissions(
    room: &room::Room,
    user_id: uuid::Uuid,
    permissions: Option<BoardPermissions>,
) {
    if let Some(permissions) = permissions {
        room.edit_permissions.insert(user_id, permissions.can_edit);
        return;
    }
    room.edit_permissions.remove(&user_id);
}

fn broadcast_role_update(
    room: &room::Room,
    user_id: uuid::Uuid,
    role: Option<BoardRole>,
    permissions: Option<BoardPermissions>,
) {
    let payload = protocol::BoardRoleUpdate {
        user_id,
        role,
        permissions,
    };
    let encoded = match serde_json::to_vec(&payload) {
        Ok(encoded) => encoded,
        Err(error) => {
            tracing::warn!("Failed to encode board role update: {}", error);
            return;
        }
    };
    let mut message = Vec::with_capacity(encoded.len() + 1);
    message.push(protocol::OP_ROLE_UPDATE);
    message.extend(encoded);
    let _ = room.tx.send(Bytes::from(message));
}

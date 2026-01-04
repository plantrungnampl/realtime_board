use axum::{
    Extension, Json,
    extract::{Path, State},
};

use crate::{
    app::state::AppState,
    auth::middleware::AuthUser,
    dto::boards::{
        BoardActionMessage, BoardMembersResponse, BoardResponse, CreateBoardRequest,
        InviteBoardMembersRequest, InviteBoardMembersResponse, UpdateBoardMemberRoleRequest,
    },
    error::AppError,
    models::boards::Board,
    usecases::boards::BoardService,
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
) -> Result<Json<Vec<BoardResponse>>, AppError> {
    let user_id = auth_user.user_id;
    let board = BoardService::get_board(&state.db, user_id).await?;
    Ok(Json(board))
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
    let response =
        BoardService::invite_board_members(&state.db, board_id, auth_user.user_id, req).await?;
    Ok((axum::http::StatusCode::CREATED, Json(response)))
}

pub async fn update_board_member_role_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((board_id, member_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Json(req): Json<UpdateBoardMemberRoleRequest>,
) -> Result<Json<BoardActionMessage>, AppError> {
    let response = BoardService::update_board_member_role(
        &state.db,
        board_id,
        auth_user.user_id,
        member_id,
        req,
    )
    .await?;
    Ok(Json(response))
}

pub async fn remove_board_member_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((board_id, member_id)): Path<(uuid::Uuid, uuid::Uuid)>,
) -> Result<Json<BoardActionMessage>, AppError> {
    let response =
        BoardService::remove_board_member(&state.db, board_id, auth_user.user_id, member_id)
            .await?;
    Ok(Json(response))
}

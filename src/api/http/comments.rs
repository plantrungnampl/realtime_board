use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use uuid::Uuid;

use crate::{
    app::state::AppState,
    auth::middleware::AuthUser,
    dto::comments::{
        CommentListResponse, CommentResponse, CreateCommentRequest, ListCommentsQuery,
    },
    error::AppError,
    usecases::comments::CommentService,
};

pub async fn list_board_comments_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<Uuid>,
    Query(query): Query<ListCommentsQuery>,
) -> Result<Json<CommentListResponse>, AppError> {
    let response =
        CommentService::list_comments(&state.db, board_id, auth_user.user_id, query).await?;
    Ok(Json(response))
}

pub async fn create_board_comment_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<Uuid>,
    Json(req): Json<CreateCommentRequest>,
) -> Result<(StatusCode, Json<CommentResponse>), AppError> {
    let response =
        CommentService::create_comment(&state.db, board_id, auth_user.user_id, req).await?;
    Ok((StatusCode::CREATED, Json(response)))
}

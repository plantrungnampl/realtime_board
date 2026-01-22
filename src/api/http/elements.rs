use axum::{
    Extension, Json,
    extract::{Path, Query, State},
};

use crate::{
    app::state::AppState,
    auth::middleware::AuthUser,
    dto::elements::{
        BoardElementResponse, CreateBoardElementRequest, DeleteBoardElementResponse,
        ExpectedVersionQuery, RestoreBoardElementResponse, UpdateBoardElementRequest,
    },
    error::AppError,
    usecases::elements::ElementService,
};

pub async fn create_board_element_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(board_id): Path<uuid::Uuid>,
    Json(req): Json<CreateBoardElementRequest>,
) -> Result<(axum::http::StatusCode, Json<BoardElementResponse>), AppError> {
    let element =
        ElementService::create_element(&state.db, &state.rooms, board_id, auth_user.user_id, req)
            .await?;
    Ok((axum::http::StatusCode::CREATED, Json(element)))
}

pub async fn update_board_element_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((board_id, element_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Json(req): Json<UpdateBoardElementRequest>,
) -> Result<Json<BoardElementResponse>, AppError> {
    let element = ElementService::update_element(
        &state.db,
        &state.rooms,
        board_id,
        element_id,
        auth_user.user_id,
        req,
    )
    .await?;
    Ok(Json(element))
}

pub async fn delete_board_element_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((board_id, element_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Query(query): Query<ExpectedVersionQuery>,
) -> Result<Json<DeleteBoardElementResponse>, AppError> {
    let response = ElementService::delete_element(
        &state.db,
        &state.rooms,
        board_id,
        element_id,
        auth_user.user_id,
        query.expected_version,
    )
    .await?;
    Ok(Json(response))
}

pub async fn restore_board_element_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((board_id, element_id)): Path<(uuid::Uuid, uuid::Uuid)>,
    Query(query): Query<ExpectedVersionQuery>,
) -> Result<Json<RestoreBoardElementResponse>, AppError> {
    let response = ElementService::restore_element(
        &state.db,
        &state.rooms,
        board_id,
        element_id,
        auth_user.user_id,
        query.expected_version,
    )
    .await?;
    Ok(Json(response))
}

use axum::{
    Extension, Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use uuid::Uuid;

use crate::{
    app::state::AppState,
    auth::middleware::AuthUser,
    dto::organizations::{
        CreateOrganizationRequest, InviteMembersRequest, InviteMembersResponse,
        InviteValidationQuery, InviteValidationResponse, OrganizationActionMessage,
        OrganizationEmailInvitesResponse, OrganizationListResponse, OrganizationMembersResponse,
        OrganizationResponse, OrganizationUsageResponse, SlugAvailabilityQuery,
        SlugAvailabilityResponse, UpdateMemberRoleRequest, UpdateOrganizationSubscriptionRequest,
    },
    error::AppError,
    usecases::organizations::OrganizationService,
};

/// Creates an organization and returns the summary payload.
pub async fn create_organization_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(req): Json<CreateOrganizationRequest>,
) -> Result<(StatusCode, Json<OrganizationResponse>), AppError> {
    let organization =
        OrganizationService::create_organization(&state.db, auth_user.user_id, req).await?;

    Ok((StatusCode::CREATED, Json(organization)))
}

/// Lists organizations the current user belongs to.
pub async fn list_organizations_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
) -> Result<Json<OrganizationListResponse>, AppError> {
    let response = OrganizationService::list_organizations(&state.db, auth_user.user_id).await?;

    Ok(Json(response))
}

/// Lists members for an organization.
pub async fn list_members_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(organization_id): Path<Uuid>,
) -> Result<Json<OrganizationMembersResponse>, AppError> {
    let response =
        OrganizationService::list_members(&state.db, organization_id, auth_user.user_id).await?;

    Ok(Json(response))
}

/// Returns resource usage for an organization.
pub async fn get_usage_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(organization_id): Path<Uuid>,
) -> Result<Json<OrganizationUsageResponse>, AppError> {
    let response =
        OrganizationService::get_usage(&state.db, organization_id, auth_user.user_id).await?;

    Ok(Json(response))
}

// Security: This endpoint was removed because it allowed free upgrades.
// Re-enable only after implementing payment verification.
// pub async fn update_subscription_tier_handle(
//     State(state): State<AppState>,
//     Extension(auth_user): Extension<AuthUser>,
//     Path(organization_id): Path<Uuid>,
//     Json(req): Json<UpdateOrganizationSubscriptionRequest>,
// ) -> Result<Json<OrganizationResponse>, AppError> {
//     let response = OrganizationService::update_subscription_tier(
//         &state.db,
//         organization_id,
//         auth_user.user_id,
//         req,
//     )
//     .await?;
//
//     Ok(Json(response))
// }

/// Lists pre-signup invites for an organization.
pub async fn list_email_invites_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(organization_id): Path<Uuid>,
) -> Result<Json<OrganizationEmailInvitesResponse>, AppError> {
    let response =
        OrganizationService::list_email_invites(&state.db, organization_id, auth_user.user_id)
            .await?;

    Ok(Json(response))
}

/// Resends a pending email invitation.
pub async fn resend_email_invite_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((organization_id, invite_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<OrganizationActionMessage>, AppError> {
    let response = OrganizationService::resend_email_invite(
        &state.db,
        state.email_service.as_ref(),
        organization_id,
        auth_user.user_id,
        invite_id,
    )
    .await?;

    Ok(Json(response))
}

/// Cancels a pending email invitation.
pub async fn cancel_email_invite_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((organization_id, invite_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<OrganizationActionMessage>, AppError> {
    let response = OrganizationService::cancel_email_invite(
        &state.db,
        organization_id,
        auth_user.user_id,
        invite_id,
    )
    .await?;

    Ok(Json(response))
}

/// Checks whether an organization slug is available.
pub async fn check_slug_availability_handle(
    State(state): State<AppState>,
    Query(query): Query<SlugAvailabilityQuery>,
) -> Result<Json<SlugAvailabilityResponse>, AppError> {
    let response = OrganizationService::check_slug_availability(&state.db, &query.slug).await?;

    Ok(Json(response))
}

/// Validates a pre-signup invite token.
pub async fn validate_invite_handle(
    State(state): State<AppState>,
    Query(query): Query<InviteValidationQuery>,
) -> Result<Json<InviteValidationResponse>, AppError> {
    let response =
        OrganizationService::validate_invite(&state.db, &query.token, &query.email).await?;

    Ok(Json(response))
}

/// Invites organization members by email.
pub async fn invite_members_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path(organization_id): Path<Uuid>,
    Json(req): Json<InviteMembersRequest>,
) -> Result<(StatusCode, Json<InviteMembersResponse>), AppError> {
    let response = OrganizationService::invite_members(
        &state.db,
        state.email_service.as_ref(),
        organization_id,
        auth_user.user_id,
        req,
    )
    .await?;

    Ok((StatusCode::CREATED, Json(response)))
}

/// Updates a member role or transfers ownership.
pub async fn update_member_role_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((organization_id, member_id)): Path<(Uuid, Uuid)>,
    Json(req): Json<UpdateMemberRoleRequest>,
) -> Result<Json<OrganizationActionMessage>, AppError> {
    let response = OrganizationService::update_member_role(
        &state.db,
        organization_id,
        auth_user.user_id,
        member_id,
        req,
    )
    .await?;

    Ok(Json(response))
}

/// Removes a member from an organization.
pub async fn remove_member_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((organization_id, member_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<OrganizationActionMessage>, AppError> {
    let response = OrganizationService::remove_member(
        &state.db,
        organization_id,
        auth_user.user_id,
        member_id,
    )
    .await?;

    Ok(Json(response))
}

/// Resends a pending member invitation.
pub async fn resend_invite_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((organization_id, member_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<OrganizationActionMessage>, AppError> {
    let response = OrganizationService::resend_invite(
        &state.db,
        state.email_service.as_ref(),
        organization_id,
        auth_user.user_id,
        member_id,
    )
    .await?;

    Ok(Json(response))
}

/// Accepts an organization invitation for the current user.
pub async fn accept_invite_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((organization_id, member_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<OrganizationActionMessage>, AppError> {
    let response = OrganizationService::accept_invitation(
        &state.db,
        organization_id,
        auth_user.user_id,
        member_id,
    )
    .await?;

    Ok(Json(response))
}

/// Declines an organization invitation for the current user.
pub async fn decline_invite_handle(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Path((organization_id, member_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<OrganizationActionMessage>, AppError> {
    let response = OrganizationService::decline_invitation(
        &state.db,
        organization_id,
        auth_user.user_id,
        member_id,
    )
    .await?;

    Ok(Json(response))
}

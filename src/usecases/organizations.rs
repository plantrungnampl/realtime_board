use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    dto::organizations::{
        CreateOrganizationRequest, InviteMembersRequest, InviteMembersResponse,
        InviteValidationResponse, OrganizationActionMessage, OrganizationEmailInviteResponse,
        OrganizationEmailInvitesResponse, OrganizationInvitationOrganization,
        OrganizationInvitationResponse, OrganizationInvitationsResponse, OrganizationListResponse,
        OrganizationMemberResponse, OrganizationMemberUser, OrganizationMembersResponse,
        OrganizationResponse, OrganizationSummaryResponse, OrganizationUsageResponse,
        SlugAvailabilityResponse, UpdateMemberRoleRequest, UpdateOrganizationSubscriptionRequest,
    },
    error::AppError,
    models::{
        organizations::OrgRole,
        users::{SubscriptionTier, User},
    },
    repositories::{boards as board_repo, organizations as org_repo, users as user_repo},
    services::email::EmailService,
};

/// Business logic for organization management.
pub struct OrganizationService;

impl OrganizationService {
    /// Creates an organization and assigns the creator as owner.
    pub async fn create_organization(
        pool: &PgPool,
        user_id: Uuid,
        req: CreateOrganizationRequest,
    ) -> Result<OrganizationResponse, AppError> {
        let name = req.name.trim();
        if name.is_empty() {
            return Err(AppError::ValidationError(
                "Organization name is required".to_string(),
            ));
        }
        if name.chars().count() > 100 {
            return Err(AppError::ValidationError(
                "Organization name must be 1-100 characters".to_string(),
            ));
        }

        let slug = build_slug(req.slug.as_deref(), name)?;
        if org_repo::organization_slug_exists(pool, &slug).await? {
            return Err(AppError::Conflict(
                "Organization slug already exists".to_string(),
            ));
        }

        let subscription_tier = req.subscription_tier.unwrap_or(SubscriptionTier::Free);
        let limits = organization_limits_for_tier(subscription_tier);
        let mut tx = pool.begin().await?;
        let organization = org_repo::create_organization(
            &mut tx,
            &req,
            &slug,
            subscription_tier,
            limits.max_members,
            limits.max_boards,
            limits.storage_limit_mb,
        )
        .await?;
        org_repo::add_owner_member(&mut tx, organization.id, user_id).await?;
        tx.commit().await?;

        Ok(OrganizationResponse::from(organization))
    }

    /// Checks whether a slug is available and returns suggestions if needed.
    pub async fn check_slug_availability(
        pool: &PgPool,
        slug: &str,
    ) -> Result<SlugAvailabilityResponse, AppError> {
        let trimmed = slug.trim();
        if trimmed.is_empty() {
            return Err(AppError::ValidationError(
                "Organization slug is required".to_string(),
            ));
        }

        let normalized = normalize_slug(trimmed);
        if !is_valid_slug(&normalized) {
            return Err(AppError::ValidationError(
                "Organization slug must be 3-100 lowercase characters, digits, or hyphens"
                    .to_string(),
            ));
        }

        let available = !org_repo::organization_slug_exists(pool, &normalized).await?;
        let suggestions = if available {
            Vec::new()
        } else {
            suggest_slugs(pool, &normalized).await?
        };

        Ok(SlugAvailabilityResponse {
            slug: normalized.clone(),
            available,
            adjusted: normalized != trimmed,
            suggestions,
        })
    }

    /// Lists organizations for the current user.
    pub async fn list_organizations(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<OrganizationListResponse, AppError> {
        let rows = org_repo::list_organizations_by_user(pool, user_id).await?;
        let data = rows
            .into_iter()
            .map(|row| OrganizationSummaryResponse {
                id: row.id,
                name: row.name,
                slug: row.slug,
                role: row.role,
            })
            .collect();

        Ok(OrganizationListResponse { data })
    }

    /// Lists pending invitations for the current user.
    pub async fn list_invitations(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<OrganizationInvitationsResponse, AppError> {
        let rows = org_repo::list_pending_invitations(pool, user_id).await?;
        let data = rows
            .into_iter()
            .map(|row| OrganizationInvitationResponse {
                member_id: row.member_id,
                role: row.role,
                invited_at: row.invited_at,
                organization: OrganizationInvitationOrganization {
                    id: row.organization_id,
                    name: row.organization_name,
                    slug: row.organization_slug,
                },
            })
            .collect();

        Ok(OrganizationInvitationsResponse { data })
    }

    /// Validates a pre-signup invitation token.
    pub async fn validate_invite(
        pool: &PgPool,
        token: &str,
        email: &str,
    ) -> Result<InviteValidationResponse, AppError> {
        let trimmed_token = token.trim();
        let trimmed_email = email.trim();
        if trimmed_token.is_empty() || trimmed_email.is_empty() {
            return Err(AppError::ValidationError(
                "Token and email are required".to_string(),
            ));
        }

        let invite = org_repo::get_email_invite_by_token(pool, trimmed_token, trimmed_email)
            .await?
            .ok_or(AppError::NotFound("Invitation not found".to_string()))?;
        if let Some(expires_at) = invite.invite_expires_at {
            if expires_at < chrono::Utc::now() {
                return Err(AppError::BadRequest(
                    "Invitation has expired".to_string(),
                ));
            }
        }

        let organization = org_repo::find_organization_by_id(pool, invite.organization_id)
            .await?
            .ok_or(AppError::NotFound("Organization not found".to_string()))?;

        Ok(InviteValidationResponse {
            organization: OrganizationInvitationOrganization {
                id: organization.id,
                name: organization.name,
                slug: organization.slug,
            },
            role: invite.role,
            invite_expires_at: invite.invite_expires_at,
        })
    }

    /// Invites members into an organization by email.
    pub async fn invite_members(
        pool: &PgPool,
        email_service: Option<&EmailService>,
        organization_id: Uuid,
        invited_by: Uuid,
        req: InviteMembersRequest,
    ) -> Result<InviteMembersResponse, AppError> {
        let inviter_role = require_member_role(pool, organization_id, invited_by).await?;
        ensure_manager(inviter_role)?;

        let organization = org_repo::find_organization_by_id(pool, organization_id)
            .await?
            .ok_or(AppError::NotFound("Organization not found".to_string()))?;

        let InviteMembersRequest {
            email,
            emails,
            role,
        } = req;
        let role = normalize_invite_role(role)?;
        let emails = collect_invite_emails(email, emails)?;
        let (users, pending_emails) = split_invite_targets(pool, &emails).await?;
        let current_members = org_repo::count_organization_members(pool, organization_id).await?;
        let current_invites =
            org_repo::count_organization_email_invites(pool, organization_id).await?;
        let requested = users.len() + pending_emails.len();
        ensure_member_capacity(
            current_members + current_invites,
            requested as i64,
            organization.max_members,
        )?;
        let invite_expires_at = chrono::Utc::now().checked_add_signed(chrono::Duration::days(7));

        let mut tx = pool.begin().await?;
        let invited_emails: Vec<String> = users.iter().map(|user| user.email.clone()).collect();
        let mut pending_invites: Vec<(String, String)> = Vec::new();
        for user in &users {
            if org_repo::organization_member_exists(&mut tx, organization_id, user.id).await? {
                return Err(AppError::Conflict(format!(
                    "User already in organization: {}",
                    user.email
                )));
            }
            org_repo::add_member_invite(&mut tx, organization_id, user.id, role, invited_by)
                .await?;
        }
        for email in &pending_emails {
            if org_repo::organization_invite_exists(&mut tx, organization_id, email).await? {
                return Err(AppError::Conflict(format!(
                    "Invite already sent to: {}",
                    email
                )));
            }
            let token = Uuid::new_v4().simple().to_string();
            org_repo::create_email_invite(
                &mut tx,
                organization_id,
                email,
                role,
                invited_by,
                &token,
                invite_expires_at,
            )
            .await?;
            pending_invites.push((email.clone(), token));
        }
        tx.commit().await?;

        send_invite_emails(email_service, &organization, &users).await?;
        send_pre_signup_invites(email_service, &organization, &pending_invites).await?;

        Ok(InviteMembersResponse {
            invited: invited_emails
                .into_iter()
                .chain(pending_emails.into_iter())
                .collect(),
            pending: pending_invites
                .into_iter()
                .map(|(email, _)| email)
                .collect(),
        })
    }

    /// Accepts a pending invitation for the current user.
    pub async fn accept_invitation(
        pool: &PgPool,
        organization_id: Uuid,
        user_id: Uuid,
        member_id: Uuid,
    ) -> Result<OrganizationActionMessage, AppError> {
        if org_repo::find_organization_by_id(pool, organization_id)
            .await?
            .is_none()
        {
            return Err(AppError::NotFound("Organization not found".to_string()));
        }

        let member = org_repo::get_member_by_id(pool, organization_id, member_id)
            .await?
            .ok_or(AppError::NotFound("Invitation not found".to_string()))?;

        if member.user_id != user_id {
            return Err(AppError::Forbidden(
                "You cannot accept another user's invitation".to_string(),
            ));
        }

        if member.accepted_at.is_some() {
            return Ok(OrganizationActionMessage {
                message: "Invitation already accepted".to_string(),
            });
        }

        let mut tx = pool.begin().await?;
        org_repo::accept_member_invitation(&mut tx, organization_id, member_id).await?;
        tx.commit().await?;

        Ok(OrganizationActionMessage {
            message: "Invitation accepted".to_string(),
        })
    }

    /// Declines a pending invitation for the current user.
    pub async fn decline_invitation(
        pool: &PgPool,
        organization_id: Uuid,
        user_id: Uuid,
        member_id: Uuid,
    ) -> Result<OrganizationActionMessage, AppError> {
        if org_repo::find_organization_by_id(pool, organization_id)
            .await?
            .is_none()
        {
            return Err(AppError::NotFound("Organization not found".to_string()));
        }

        let member = org_repo::get_member_by_id(pool, organization_id, member_id)
            .await?
            .ok_or(AppError::NotFound("Invitation not found".to_string()))?;

        if member.user_id != user_id {
            return Err(AppError::Forbidden(
                "You cannot decline another user's invitation".to_string(),
            ));
        }

        if member.accepted_at.is_some() {
            return Err(AppError::Conflict("Membership already active".to_string()));
        }

        let mut tx = pool.begin().await?;
        org_repo::remove_member(&mut tx, organization_id, member_id).await?;
        tx.commit().await?;

        Ok(OrganizationActionMessage {
            message: "Invitation declined".to_string(),
        })
    }

    /// Lists organization members.
    pub async fn list_members(
        pool: &PgPool,
        organization_id: Uuid,
        user_id: Uuid,
    ) -> Result<OrganizationMembersResponse, AppError> {
        require_member_role(pool, organization_id, user_id).await?;
        let rows = org_repo::list_members(pool, organization_id).await?;
        let data = rows
            .into_iter()
            .map(|row| OrganizationMemberResponse {
                id: row.member_id,
                user: OrganizationMemberUser {
                    id: row.user_id,
                    username: row.username.unwrap_or_default(),
                    display_name: row.display_name,
                    avatar_url: row.avatar_url,
                },
                role: row.role,
                invited_at: row.invited_at,
                accepted_at: row.accepted_at,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect();

        Ok(OrganizationMembersResponse { data })
    }

    /// Returns resource usage for an organization.
    pub async fn get_usage(
        pool: &PgPool,
        organization_id: Uuid,
        user_id: Uuid,
    ) -> Result<OrganizationUsageResponse, AppError> {
        let organization = org_repo::find_organization_by_id(pool, organization_id)
            .await?
            .ok_or(AppError::NotFound("Organization not found".to_string()))?;
        require_member_role(pool, organization_id, user_id).await?;

        let usage =
            load_usage_snapshot(pool, organization_id, organization.storage_used_mb).await?;

        Ok(OrganizationUsageResponse {
            members_used: usage.members_used,
            members_limit: organization.max_members,
            boards_used: usage.boards_used,
            boards_limit: organization.max_boards,
            storage_used_mb: usage.storage_used_mb,
            storage_limit_mb: organization.storage_limit_mb,
            members_warning: is_usage_warning(usage.members_used, organization.max_members),
            boards_warning: is_usage_warning(usage.boards_used, organization.max_boards),
            storage_warning: is_usage_warning(
                i64::from(usage.storage_used_mb),
                organization.storage_limit_mb,
            ),
        })
    }

    /// Updates the subscription tier and recalculates limits.
    pub async fn update_subscription_tier(
        pool: &PgPool,
        organization_id: Uuid,
        requester_id: Uuid,
        req: UpdateOrganizationSubscriptionRequest,
    ) -> Result<OrganizationResponse, AppError> {
        let requester_role = require_member_role(pool, organization_id, requester_id).await?;
        ensure_owner(requester_role)?;

        let organization = org_repo::find_organization_by_id(pool, organization_id)
            .await?
            .ok_or(AppError::NotFound("Organization not found".to_string()))?;

        let limits = organization_limits_for_tier(req.subscription_tier);
        let usage =
            load_usage_snapshot(pool, organization_id, organization.storage_used_mb).await?;
        ensure_usage_within_limits(&usage, limits)?;

        let mut tx = pool.begin().await?;
        let updated = org_repo::update_organization_subscription(
            &mut tx,
            organization_id,
            req.subscription_tier,
            limits.max_members,
            limits.max_boards,
            limits.storage_limit_mb,
        )
        .await?;
        tx.commit().await?;

        Ok(OrganizationResponse::from(updated))
    }

    /// Lists pre-signup invites for an organization.
    pub async fn list_email_invites(
        pool: &PgPool,
        organization_id: Uuid,
        user_id: Uuid,
    ) -> Result<OrganizationEmailInvitesResponse, AppError> {
        let role = require_member_role(pool, organization_id, user_id).await?;
        ensure_manager(role)?;

        let rows = org_repo::list_email_invites(pool, organization_id).await?;
        let data = rows
            .into_iter()
            .map(|row| OrganizationEmailInviteResponse {
                id: row.id,
                email: row.email,
                role: row.role,
                invited_at: row.invited_at,
                invite_expires_at: row.invite_expires_at,
            })
            .collect();

        Ok(OrganizationEmailInvitesResponse { data })
    }

    /// Resends a pre-signup email invite.
    pub async fn resend_email_invite(
        pool: &PgPool,
        email_service: Option<&EmailService>,
        organization_id: Uuid,
        requester_id: Uuid,
        invite_id: Uuid,
    ) -> Result<OrganizationActionMessage, AppError> {
        let requester_role = require_member_role(pool, organization_id, requester_id).await?;
        ensure_manager(requester_role)?;

        let organization = org_repo::find_organization_by_id(pool, organization_id)
            .await?
            .ok_or(AppError::NotFound("Organization not found".to_string()))?;

        let invite = org_repo::get_email_invite_by_id(pool, organization_id, invite_id)
            .await?
            .ok_or(AppError::NotFound("Email invite not found".to_string()))?;

        let invite_expires_at = chrono::Utc::now().checked_add_signed(chrono::Duration::days(7));
        let token = Uuid::new_v4().simple().to_string();

        let mut tx = pool.begin().await?;
        org_repo::resend_email_invite(
            &mut tx,
            organization_id,
            invite_id,
            &token,
            invite_expires_at,
        )
        .await?;
        tx.commit().await?;

        send_pre_signup_invites(email_service, &organization, &[(invite.email, token)]).await?;

        Ok(OrganizationActionMessage {
            message: "Email invite resent".to_string(),
        })
    }

    /// Cancels a pre-signup email invite.
    pub async fn cancel_email_invite(
        pool: &PgPool,
        organization_id: Uuid,
        requester_id: Uuid,
        invite_id: Uuid,
    ) -> Result<OrganizationActionMessage, AppError> {
        let requester_role = require_member_role(pool, organization_id, requester_id).await?;
        ensure_manager(requester_role)?;

        if org_repo::get_email_invite_by_id(pool, organization_id, invite_id)
            .await?
            .is_none()
        {
            return Err(AppError::NotFound("Email invite not found".to_string()));
        }

        let mut tx = pool.begin().await?;
        org_repo::delete_email_invite(&mut tx, organization_id, invite_id).await?;
        tx.commit().await?;

        Ok(OrganizationActionMessage {
            message: "Email invite canceled".to_string(),
        })
    }

    /// Updates a member role or transfers ownership.
    pub async fn update_member_role(
        pool: &PgPool,
        organization_id: Uuid,
        requester_id: Uuid,
        member_id: Uuid,
        req: UpdateMemberRoleRequest,
    ) -> Result<OrganizationActionMessage, AppError> {
        let requester_role = require_member_role(pool, organization_id, requester_id).await?;
        ensure_manager(requester_role)?;

        let member = org_repo::get_member_by_id(pool, organization_id, member_id)
            .await?
            .ok_or(AppError::NotFound(
                "Organization member not found".to_string(),
            ))?;

        if member.role == OrgRole::Owner && requester_role != OrgRole::Owner {
            return Err(AppError::Forbidden(
                "Only owners can update owner roles".to_string(),
            ));
        }

        let mut tx = pool.begin().await?;
        if req.role == OrgRole::Owner {
            if requester_role != OrgRole::Owner {
                return Err(AppError::Forbidden(
                    "Only owners can transfer ownership".to_string(),
                ));
            }
            org_repo::demote_other_owners(&mut tx, organization_id, member_id, OrgRole::Admin)
                .await?;
            org_repo::update_member_role(&mut tx, organization_id, member_id, OrgRole::Owner)
                .await?;
        } else {
            org_repo::update_member_role(&mut tx, organization_id, member_id, req.role).await?;
        }
        tx.commit().await?;

        Ok(OrganizationActionMessage {
            message: "Member role updated".to_string(),
        })
    }

    /// Removes a member from an organization.
    pub async fn remove_member(
        pool: &PgPool,
        organization_id: Uuid,
        requester_id: Uuid,
        member_id: Uuid,
    ) -> Result<OrganizationActionMessage, AppError> {
        let requester_role = require_member_role(pool, organization_id, requester_id).await?;
        ensure_manager(requester_role)?;

        let member = org_repo::get_member_by_id(pool, organization_id, member_id)
            .await?
            .ok_or(AppError::NotFound(
                "Organization member not found".to_string(),
            ))?;

        if member.role == OrgRole::Owner {
            if requester_role != OrgRole::Owner {
                return Err(AppError::Forbidden(
                    "Only owners can remove owners".to_string(),
                ));
            }
            let owners = org_repo::count_owners(pool, organization_id).await?;
            if owners <= 1 {
                return Err(AppError::BadRequest(
                    "Cannot remove the last owner".to_string(),
                ));
            }
        }

        let mut tx = pool.begin().await?;
        org_repo::remove_member(&mut tx, organization_id, member_id).await?;
        tx.commit().await?;

        Ok(OrganizationActionMessage {
            message: "Member removed".to_string(),
        })
    }

    /// Resends a pending invitation.
    pub async fn resend_invite(
        pool: &PgPool,
        email_service: Option<&EmailService>,
        organization_id: Uuid,
        requester_id: Uuid,
        member_id: Uuid,
    ) -> Result<OrganizationActionMessage, AppError> {
        let requester_role = require_member_role(pool, organization_id, requester_id).await?;
        ensure_manager(requester_role)?;

        let organization = org_repo::find_organization_by_id(pool, organization_id)
            .await?
            .ok_or(AppError::NotFound("Organization not found".to_string()))?;

        let member = org_repo::get_member_by_id(pool, organization_id, member_id)
            .await?
            .ok_or(AppError::NotFound(
                "Organization member not found".to_string(),
            ))?;

        if member.accepted_at.is_some() {
            return Err(AppError::BadRequest(
                "Member already accepted invitation".to_string(),
            ));
        }

        let invited_user = user_repo::get_user_by_id(pool, member.user_id).await?;

        let mut tx = pool.begin().await?;
        org_repo::resend_invite(&mut tx, organization_id, member_id).await?;
        tx.commit().await?;

        send_invite_emails(email_service, &organization, &[invited_user]).await?;

        Ok(OrganizationActionMessage {
            message: "Invitation resent".to_string(),
        })
    }
}

fn build_slug(provided: Option<&str>, name: &str) -> Result<String, AppError> {
    let slug = if let Some(value) = provided {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            normalize_slug(name)
        } else {
            normalize_slug(trimmed)
        }
    } else {
        normalize_slug(name)
    };

    if !is_valid_slug(&slug) {
        return Err(AppError::ValidationError(
            "Organization slug must be 3-100 lowercase characters, digits, or hyphens".to_string(),
        ));
    }

    Ok(slug)
}

fn normalize_slug(value: &str) -> String {
    let mut slug = String::new();
    let mut last_hyphen = false;
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            last_hyphen = false;
        } else if !last_hyphen {
            slug.push('-');
            last_hyphen = true;
        }
    }

    let trimmed = slug.trim_matches('-');
    let mut normalized: String = trimmed.chars().take(100).collect();
    normalized = normalized.trim_matches('-').to_string();
    normalized
}

fn is_valid_slug(slug: &str) -> bool {
    let len = slug.chars().count();
    if !(3..=100).contains(&len) {
        return false;
    }

    slug.chars()
        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
}

fn normalize_invite_role(role: Option<OrgRole>) -> Result<OrgRole, AppError> {
    let role = role.unwrap_or(OrgRole::Member);
    if matches!(role, OrgRole::Owner) {
        return Err(AppError::ValidationError(
            "Owner role cannot be assigned via invite".to_string(),
        ));
    }
    Ok(role)
}

async fn require_member_role(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<OrgRole, AppError> {
    org_repo::get_member_role(pool, organization_id, user_id)
        .await?
        .ok_or(AppError::Forbidden(
            "You are not a member of this organization".to_string(),
        ))
}

fn ensure_manager(role: OrgRole) -> Result<(), AppError> {
    match role {
        OrgRole::Owner | OrgRole::Admin => Ok(()),
        _ => Err(AppError::Forbidden(
            "You do not have permission to manage members".to_string(),
        )),
    }
}

fn ensure_owner(role: OrgRole) -> Result<(), AppError> {
    if role == OrgRole::Owner {
        return Ok(());
    }

    Err(AppError::Forbidden(
        "Only owners can update subscription settings".to_string(),
    ))
}

#[derive(Debug, Clone, Copy)]
struct OrganizationLimits {
    max_members: i32,
    max_boards: i32,
    storage_limit_mb: i32,
}

#[derive(Debug, Clone, Copy)]
struct OrganizationUsageSnapshot {
    members_used: i64,
    boards_used: i64,
    storage_used_mb: i32,
}

fn organization_limits_for_tier(tier: SubscriptionTier) -> OrganizationLimits {
    match tier {
        SubscriptionTier::Free => OrganizationLimits {
            max_members: 3,
            max_boards: 5,
            storage_limit_mb: 100,
        },
        SubscriptionTier::Starter => OrganizationLimits {
            max_members: 10,
            max_boards: 25,
            storage_limit_mb: 1024,
        },
        SubscriptionTier::Professional => OrganizationLimits {
            max_members: 50,
            max_boards: 0,
            storage_limit_mb: 10_240,
        },
        SubscriptionTier::Enterprise => OrganizationLimits {
            max_members: 0,
            max_boards: 0,
            storage_limit_mb: 102_400,
        },
    }
}

async fn load_usage_snapshot(
    pool: &PgPool,
    organization_id: Uuid,
    storage_used_mb: i32,
) -> Result<OrganizationUsageSnapshot, AppError> {
    let member_count = org_repo::count_organization_members(pool, organization_id).await?;
    let invite_count = org_repo::count_organization_email_invites(pool, organization_id).await?;
    let boards_used = board_repo::count_boards_by_organization(pool, organization_id).await?;

    Ok(OrganizationUsageSnapshot {
        members_used: member_count + invite_count,
        boards_used,
        storage_used_mb,
    })
}

fn ensure_usage_within_limits(
    usage: &OrganizationUsageSnapshot,
    limits: OrganizationLimits,
) -> Result<(), AppError> {
    if is_usage_over_limit(usage.members_used, limits.max_members) {
        return Err(AppError::BadRequest(
            "Subscription tier not allowed: member usage exceeds limits".to_string(),
        ));
    }
    if is_usage_over_limit(usage.boards_used, limits.max_boards) {
        return Err(AppError::BadRequest(
            "Subscription tier not allowed: board usage exceeds limits".to_string(),
        ));
    }
    if is_usage_over_limit(i64::from(usage.storage_used_mb), limits.storage_limit_mb) {
        return Err(AppError::BadRequest(
            "Subscription tier not allowed: storage usage exceeds limits".to_string(),
        ));
    }

    Ok(())
}

fn ensure_member_capacity(current: i64, additional: i64, limit: i32) -> Result<(), AppError> {
    if is_limit_exceeded(current, additional, limit) {
        return Err(AppError::LimitExceeded(
            "Organization member limit reached".to_string(),
        ));
    }

    Ok(())
}

fn is_limit_exceeded(current: i64, additional: i64, limit: i32) -> bool {
    if limit <= 0 {
        return false;
    }

    current.saturating_add(additional) > i64::from(limit)
}

fn is_usage_over_limit(current: i64, limit: i32) -> bool {
    if limit <= 0 {
        return false;
    }

    current > i64::from(limit)
}

fn is_usage_warning(current: i64, limit: i32) -> bool {
    if limit <= 0 {
        return false;
    }

    current.saturating_mul(100) >= i64::from(limit).saturating_mul(80)
}

fn collect_invite_emails(
    email: Option<String>,
    email_list: Option<Vec<String>>,
) -> Result<Vec<String>, AppError> {
    let mut emails = Vec::new();
    if let Some(email) = email {
        emails.push(email);
    }
    if let Some(list) = email_list {
        emails.extend(list);
    }

    let mut unique = std::collections::HashSet::new();
    let mut cleaned = Vec::new();
    for email in emails {
        let trimmed = email.trim().to_lowercase();
        if trimmed.is_empty() {
            continue;
        }
        if !unique.insert(trimmed.clone()) {
            return Err(AppError::ValidationError(format!(
                "Duplicate email in invite list: {}",
                trimmed
            )));
        }
        cleaned.push(trimmed);
    }

    if cleaned.is_empty() {
        return Err(AppError::ValidationError(
            "At least one email is required".to_string(),
        ));
    }

    let invalid: Vec<String> = cleaned
        .iter()
        .filter(|email| !is_valid_email(email))
        .cloned()
        .collect();
    if !invalid.is_empty() {
        return Err(AppError::ValidationError(format!(
            "Invalid email(s): {}",
            invalid.join(", ")
        )));
    }

    Ok(cleaned)
}

async fn split_invite_targets(
    pool: &PgPool,
    emails: &[String],
) -> Result<(Vec<User>, Vec<String>), AppError> {
    let mut users = Vec::new();
    let mut pending = Vec::new();
    for email in emails {
        match user_repo::find_user_by_email(pool, email).await? {
            Some(user) => users.push(user),
            None => pending.push(email.clone()),
        }
    }

    Ok((users, pending))
}

async fn send_invite_emails(
    email_service: Option<&EmailService>,
    organization: &crate::models::organizations::Organization,
    users: &[User],
) -> Result<(), AppError> {
    let Some(service) = email_service else {
        return Ok(());
    };

    for user in users {
        service
            .send_organization_invite(&user.email, &organization.name, &organization.slug, None)
            .await?;
    }

    Ok(())
}

async fn send_pre_signup_invites(
    email_service: Option<&EmailService>,
    organization: &crate::models::organizations::Organization,
    invites: &[(String, String)],
) -> Result<(), AppError> {
    let Some(service) = email_service else {
        return Ok(());
    };

    for (email, token) in invites {
        service
            .send_organization_invite(email, &organization.name, &organization.slug, Some(token))
            .await?;
    }

    Ok(())
}

async fn suggest_slugs(pool: &PgPool, base: &str) -> Result<Vec<String>, AppError> {
    let suffixes = ["-team", "-hq", "-studio", "-1", "-2", "-3"];
    let mut suggestions = Vec::new();
    for suffix in suffixes {
        if suggestions.len() >= 3 {
            break;
        }
        let candidate = format!("{}{}", base, suffix);
        if !is_valid_slug(&candidate) {
            continue;
        }
        if !org_repo::organization_slug_exists(pool, &candidate).await? {
            suggestions.push(candidate);
        }
    }
    Ok(suggestions)
}

fn is_valid_email(email: &str) -> bool {
    let trimmed = email.trim();
    if trimmed.is_empty() || trimmed.contains(' ') {
        return false;
    }
    let mut parts = trimmed.split('@');
    let local = match parts.next() {
        Some(value) => value,
        None => return false,
    };
    let domain = match parts.next() {
        Some(value) => value,
        None => return false,
    };
    if parts.next().is_some() {
        return false;
    }
    if local.is_empty() || domain.is_empty() {
        return false;
    }
    if domain.starts_with('.') || domain.ends_with('.') {
        return false;
    }
    domain.contains('.')
}

#[cfg(test)]
mod tests {
    use super::{
        build_slug, is_limit_exceeded, is_usage_over_limit, is_usage_warning, is_valid_slug,
        normalize_slug, organization_limits_for_tier,
    };
    use crate::models::users::SubscriptionTier;

    #[test]
    fn generate_slug_normalizes_name() {
        let slug = normalize_slug("My Org Name");
        assert_eq!(slug, "my-org-name");
    }

    #[test]
    fn slug_validation_allows_expected_format() {
        assert!(is_valid_slug("my-org-123"));
        assert!(!is_valid_slug("MyOrg"));
        assert!(!is_valid_slug("ab"));
        assert!(!is_valid_slug("invalid_slug"));
    }

    #[test]
    fn build_slug_uses_provided_when_valid() {
        let slug = build_slug(Some("acme-inc"), "Acme Inc").expect("slug");
        assert_eq!(slug, "acme-inc");
    }

    #[test]
    fn build_slug_sanitizes_invalid_input() {
        let slug = build_slug(Some("Acme Inc"), "Acme Inc").expect("slug");
        assert_eq!(slug, "acme-inc");
    }

    #[test]
    fn limit_exceeded_when_over_capacity() {
        assert!(is_limit_exceeded(5, 1, 5));
        assert!(!is_limit_exceeded(4, 1, 5));
    }

    #[test]
    fn limit_exceeded_skips_when_unlimited() {
        assert!(!is_limit_exceeded(100, 1, 0));
    }

    #[test]
    fn usage_warning_triggers_at_eighty_percent() {
        assert!(is_usage_warning(8, 10));
        assert!(!is_usage_warning(7, 10));
    }

    #[test]
    fn usage_over_limit_respects_unlimited() {
        assert!(!is_usage_over_limit(10, 0));
        assert!(is_usage_over_limit(11, 10));
        assert!(!is_usage_over_limit(10, 10));
    }

    #[test]
    fn tier_limits_follow_design_doc() {
        let free = organization_limits_for_tier(SubscriptionTier::Free);
        assert_eq!(free.max_members, 3);
        assert_eq!(free.max_boards, 5);
        assert_eq!(free.storage_limit_mb, 100);

        let starter = organization_limits_for_tier(SubscriptionTier::Starter);
        assert_eq!(starter.max_members, 10);
        assert_eq!(starter.max_boards, 25);
        assert_eq!(starter.storage_limit_mb, 1024);

        let professional = organization_limits_for_tier(SubscriptionTier::Professional);
        assert_eq!(professional.max_members, 50);
        assert_eq!(professional.max_boards, 0);
        assert_eq!(professional.storage_limit_mb, 10_240);

        let enterprise = organization_limits_for_tier(SubscriptionTier::Enterprise);
        assert_eq!(enterprise.max_members, 0);
        assert_eq!(enterprise.max_boards, 0);
        assert_eq!(enterprise.storage_limit_mb, 102_400);
    }
}

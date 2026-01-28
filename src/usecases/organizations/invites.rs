use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    dto::organizations::{
        InviteMembersRequest, InviteMembersResponse, InviteValidationResponse,
        OrganizationActionMessage, OrganizationEmailInviteResponse,
        OrganizationEmailInvitesResponse, OrganizationInvitationOrganization,
        OrganizationInvitationResponse, OrganizationInvitationsResponse,
    },
    error::AppError,
    models::users::User,
    repositories::{boards as board_repo, organizations as org_repo, users as user_repo},
    services::email::EmailService,
    telemetry::{BusinessEvent, redact_email},
    usecases::invites::collect_invite_emails,
};

use super::{
    helpers::{
        ensure_manager, ensure_member_capacity, normalize_invite_role, require_member_role,
        split_invite_targets,
    },
    OrganizationService,
};

impl OrganizationService {
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
        let emails = collect_invite_emails(email, emails, None)?;
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

        for email in invited_emails.iter().chain(pending_emails.iter()) {
            BusinessEvent::MemberInvited {
                org_id: organization_id,
                inviter_id: invited_by,
                invitee_email_redacted: redact_email(email),
            }
            .log();
        }

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
        BusinessEvent::MemberJoined {
            org_id: organization_id,
            user_id,
        }
        .log();

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
        board_repo::remove_board_memberships_by_organization(
            &mut tx,
            organization_id,
            member.user_id,
        )
        .await?;
        org_repo::remove_member(&mut tx, organization_id, member_id).await?;
        tx.commit().await?;

        Ok(OrganizationActionMessage {
            message: "Invitation declined".to_string(),
        })
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

pub(crate) async fn send_invite_emails(
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

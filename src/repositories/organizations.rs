use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    dto::organizations::CreateOrganizationRequest,
    error::AppError,
    models::{
        organizations::{OrgRole, Organization},
        users::SubscriptionTier,
    },
};

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct OrganizationSummaryRow {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub role: OrgRole,
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct OrganizationMemberRow {
    pub member_id: Uuid,
    pub user_id: Uuid,
    pub username: Option<String>,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub role: OrgRole,
    pub invited_at: Option<chrono::DateTime<chrono::Utc>>,
    pub accepted_at: Option<chrono::DateTime<chrono::Utc>>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct OrganizationMemberRecord {
    pub user_id: Uuid,
    pub role: OrgRole,
    pub accepted_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct OrganizationInvitationRow {
    pub member_id: Uuid,
    pub role: OrgRole,
    pub invited_at: Option<chrono::DateTime<chrono::Utc>>,
    pub organization_id: Uuid,
    pub organization_name: String,
    pub organization_slug: String,
}

#[derive(Debug, sqlx::FromRow)]
pub(crate) struct OrganizationInviteRecord {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub email: String,
    pub role: OrgRole,
    pub invited_by: Option<Uuid>,
    pub invited_at: Option<chrono::DateTime<chrono::Utc>>,
    pub invite_expires_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Returns the organization by id if it exists.
pub async fn find_organization_by_id(
    pool: &PgPool,
    organization_id: Uuid,
) -> Result<Option<Organization>, AppError> {
    let organization = sqlx::query_as(
        r#"
            SELECT *
            FROM core.organization
            WHERE id = $1
            AND deleted_at IS NULL
        "#,
    )
    .bind(organization_id)
    .fetch_optional(pool)
    .await?;

    Ok(organization)
}

/// Returns the membership role for a user inside an organization.
pub async fn get_member_role(
    pool: &PgPool,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<Option<OrgRole>, AppError> {
    let role = sqlx::query_scalar::<_, OrgRole>(
        r#"
            SELECT role
            FROM core.organization_member
            WHERE organization_id = $1
            AND user_id = $2
            AND accepted_at IS NOT NULL
        "#,
    )
    .bind(organization_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;

    Ok(role)
}

/// Returns a member record by id scoped to the organization.
pub async fn get_member_by_id(
    pool: &PgPool,
    organization_id: Uuid,
    member_id: Uuid,
) -> Result<Option<OrganizationMemberRecord>, AppError> {
    let member = sqlx::query_as::<_, OrganizationMemberRecord>(
        r#"
            SELECT user_id, role, accepted_at
            FROM core.organization_member
            WHERE organization_id = $1
            AND id = $2
        "#,
    )
    .bind(organization_id)
    .bind(member_id)
    .fetch_optional(pool)
    .await?;

    Ok(member)
}

/// Lists members of an organization with user info.
pub async fn list_members(
    pool: &PgPool,
    organization_id: Uuid,
) -> Result<Vec<OrganizationMemberRow>, AppError> {
    let rows = sqlx::query_as::<_, OrganizationMemberRow>(
        r#"
            SELECT
                om.id AS member_id,
                u.id AS user_id,
                u.username,
                u.display_name,
                u.avatar_url,
                om.role,
                om.invited_at,
                om.accepted_at,
                om.created_at,
                om.updated_at
            FROM core.organization_member om
            JOIN core.user u ON u.id = om.user_id
            WHERE om.organization_id = $1
            AND u.deleted_at IS NULL
            ORDER BY om.created_at ASC
        "#,
    )
    .bind(organization_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Lists pre-signup invites for an organization.
pub async fn list_email_invites(
    pool: &PgPool,
    organization_id: Uuid,
) -> Result<Vec<OrganizationInviteRecord>, AppError> {
    let rows = sqlx::query_as::<_, OrganizationInviteRecord>(
        r#"
            SELECT
                id,
                organization_id,
                email,
                role,
                invited_by,
                invited_at,
                invite_expires_at
            FROM core.organization_invite
            WHERE organization_id = $1
            ORDER BY invited_at DESC NULLS LAST
        "#,
    )
    .bind(organization_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Returns a pre-signup invite by id.
pub async fn get_email_invite_by_id(
    pool: &PgPool,
    organization_id: Uuid,
    invite_id: Uuid,
) -> Result<Option<OrganizationInviteRecord>, AppError> {
    let invite = sqlx::query_as::<_, OrganizationInviteRecord>(
        r#"
            SELECT
                id,
                organization_id,
                email,
                role,
                invited_by,
                invited_at,
                invite_expires_at
            FROM core.organization_invite
            WHERE organization_id = $1
            AND id = $2
        "#,
    )
    .bind(organization_id)
    .bind(invite_id)
    .fetch_optional(pool)
    .await?;

    Ok(invite)
}

/// Lists pending invitations for a user.
pub async fn list_pending_invitations(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<Vec<OrganizationInvitationRow>, AppError> {
    let rows = sqlx::query_as::<_, OrganizationInvitationRow>(
        r#"
            SELECT
                om.id AS member_id,
                om.role,
                om.invited_at,
                o.id AS organization_id,
                o.name AS organization_name,
                o.slug AS organization_slug
            FROM core.organization_member om
            JOIN core.organization o ON o.id = om.organization_id
            WHERE om.user_id = $1
            AND om.accepted_at IS NULL
            AND o.deleted_at IS NULL
            ORDER BY om.invited_at DESC NULLS LAST
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Returns true when a pending invite exists for the email.
pub async fn organization_invite_exists(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    email: &str,
) -> Result<bool, AppError> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"
            SELECT EXISTS(
                SELECT 1
                FROM core.organization_invite
                WHERE organization_id = $1
                AND LOWER(email) = LOWER($2)
            )
        "#,
    )
    .bind(organization_id)
    .bind(email)
    .fetch_one(&mut **tx)
    .await?;

    Ok(exists)
}

/// Adds a pre-signup invite entry for an email.
pub async fn create_email_invite(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    email: &str,
    role: OrgRole,
    invited_by: Uuid,
    invite_token: &str,
    invite_expires_at: Option<chrono::DateTime<chrono::Utc>>,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            INSERT INTO core.organization_invite (
                organization_id,
                email,
                role,
                invited_by,
                invited_at,
                invite_token,
                invite_expires_at
            )
            VALUES ($1, $2, $3, $4, NOW(), $5, $6)
        "#,
    )
    .bind(organization_id)
    .bind(email)
    .bind(role)
    .bind(invited_by)
    .bind(invite_token)
    .bind(invite_expires_at)
    .execute(&mut **tx)
    .await
    .map_err(map_invite_unique_violation)?;

    Ok(())
}

/// Resends a pre-signup invite by updating its token and timestamps.
pub async fn resend_email_invite(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    invite_id: Uuid,
    invite_token: &str,
    invite_expires_at: Option<chrono::DateTime<chrono::Utc>>,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            UPDATE core.organization_invite
            SET invited_at = NOW(),
                invite_token = $3,
                invite_expires_at = $4
            WHERE organization_id = $1
            AND id = $2
        "#,
    )
    .bind(organization_id)
    .bind(invite_id)
    .bind(invite_token)
    .bind(invite_expires_at)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

/// Lists pending pre-signup invites for an email.
pub async fn list_invites_by_email(
    pool: &PgPool,
    email: &str,
) -> Result<Vec<OrganizationInviteRecord>, AppError> {
    let rows = sqlx::query_as::<_, OrganizationInviteRecord>(
        r#"
            SELECT
                id,
                organization_id,
                email,
                role,
                invited_by,
                invited_at,
                invite_expires_at
            FROM core.organization_invite
            WHERE LOWER(email) = LOWER($1)
            ORDER BY invited_at DESC NULLS LAST
        "#,
    )
    .bind(email)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Deletes a pre-signup invite by id.
pub async fn delete_email_invite(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    invite_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            DELETE FROM core.organization_invite
            WHERE organization_id = $1
            AND id = $2
        "#,
    )
    .bind(organization_id)
    .bind(invite_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

/// Deletes pending pre-signup invites for an email.
pub async fn delete_invites_by_email(
    tx: &mut Transaction<'_, Postgres>,
    email: &str,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            DELETE FROM core.organization_invite
            WHERE LOWER(email) = LOWER($1)
        "#,
    )
    .bind(email)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

/// Adds a member entry derived from a pre-signup invite.
pub async fn add_member_from_email_invite(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    user_id: Uuid,
    role: OrgRole,
    invited_by: Option<Uuid>,
    invited_at: Option<chrono::DateTime<chrono::Utc>>,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            INSERT INTO core.organization_member (
                organization_id,
                user_id,
                role,
                invited_by,
                invited_at
            )
            VALUES ($1, $2, $3, $4, COALESCE($5, NOW()))
            ON CONFLICT (organization_id, user_id) DO NOTHING
        "#,
    )
    .bind(organization_id)
    .bind(user_id)
    .bind(role)
    .bind(invited_by)
    .bind(invited_at)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

/// Updates a member role.
pub async fn update_member_role(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    member_id: Uuid,
    role: OrgRole,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            UPDATE core.organization_member
            SET role = $3, updated_at = NOW()
            WHERE organization_id = $1
            AND id = $2
        "#,
    )
    .bind(organization_id)
    .bind(member_id)
    .bind(role)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

/// Marks an invitation as accepted.
pub async fn accept_member_invitation(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    member_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            UPDATE core.organization_member
            SET accepted_at = NOW(), updated_at = NOW()
            WHERE organization_id = $1
            AND id = $2
            AND accepted_at IS NULL
        "#,
    )
    .bind(organization_id)
    .bind(member_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

/// Updates all owners to a new role, excluding the target member.
pub async fn demote_other_owners(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    target_member_id: Uuid,
    new_role: OrgRole,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            UPDATE core.organization_member
            SET role = $3, updated_at = NOW()
            WHERE organization_id = $1
            AND role = 'owner'
            AND id <> $2
        "#,
    )
    .bind(organization_id)
    .bind(target_member_id)
    .bind(new_role)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

/// Removes a member from an organization.
pub async fn remove_member(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    member_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            DELETE FROM core.organization_member
            WHERE organization_id = $1
            AND id = $2
        "#,
    )
    .bind(organization_id)
    .bind(member_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

/// Counts how many owners exist in an organization.
pub async fn count_owners(pool: &PgPool, organization_id: Uuid) -> Result<i64, AppError> {
    let count = sqlx::query_scalar::<_, i64>(
        r#"
            SELECT COUNT(*)
            FROM core.organization_member
            WHERE organization_id = $1
            AND role = 'owner'
        "#,
    )
    .bind(organization_id)
    .fetch_one(pool)
    .await?;

    Ok(count)
}

/// Counts all member slots (accepted + pending) for an organization.
pub async fn count_organization_members(
    pool: &PgPool,
    organization_id: Uuid,
) -> Result<i64, AppError> {
    let count = sqlx::query_scalar::<_, i64>(
        r#"
            SELECT COUNT(*)
            FROM core.organization_member
            WHERE organization_id = $1
            AND role <> 'owner'
        "#,
    )
    .bind(organization_id)
    .fetch_one(pool)
    .await?;

    Ok(count)
}

/// Counts pre-signup email invites for an organization.
pub async fn count_organization_email_invites(
    pool: &PgPool,
    organization_id: Uuid,
) -> Result<i64, AppError> {
    let count = sqlx::query_scalar::<_, i64>(
        r#"
            SELECT COUNT(*)
            FROM core.organization_invite
            WHERE organization_id = $1
        "#,
    )
    .bind(organization_id)
    .fetch_one(pool)
    .await?;

    Ok(count)
}

/// Marks an invitation as resent.
pub async fn resend_invite(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    member_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            UPDATE core.organization_member
            SET invited_at = NOW(), updated_at = NOW()
            WHERE organization_id = $1
            AND id = $2
        "#,
    )
    .bind(organization_id)
    .bind(member_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

/// Lists organizations that the user belongs to.
pub async fn list_organizations_by_user(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<Vec<OrganizationSummaryRow>, AppError> {
    let rows = sqlx::query_as::<_, OrganizationSummaryRow>(
        r#"
            SELECT o.id, o.name, o.slug, om.role
            FROM core.organization_member om
            JOIN core.organization o ON o.id = om.organization_id
            WHERE om.user_id = $1
            AND om.accepted_at IS NOT NULL
            AND o.deleted_at IS NULL
            ORDER BY o.created_at DESC
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(rows)
}

/// Returns true when the organization slug is already taken.
pub async fn organization_slug_exists(pool: &PgPool, slug: &str) -> Result<bool, AppError> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"
            SELECT EXISTS(
                SELECT 1
                FROM core.organization
                WHERE slug = $1
                AND deleted_at IS NULL
            )
        "#,
    )
    .bind(slug)
    .fetch_one(pool)
    .await?;

    Ok(exists)
}

/// Inserts a new organization row and returns the full organization model.
pub async fn create_organization(
    tx: &mut Transaction<'_, Postgres>,
    req: &CreateOrganizationRequest,
    slug: &str,
    subscription_tier: SubscriptionTier,
    max_members: i32,
    max_boards: i32,
    storage_limit_mb: i32,
) -> Result<Organization, AppError> {
    let organization = sqlx::query_as(
        r#"
            INSERT INTO core.organization (
                name,
                slug,
                description,
                logo_url,
                subscription_tier,
                max_members,
                max_boards,
                storage_limit_mb
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        "#,
    )
    .bind(req.name.trim())
    .bind(slug)
    .bind(req.description.as_deref())
    .bind(req.logo_url.as_deref())
    .bind(subscription_tier)
    .bind(max_members)
    .bind(max_boards)
    .bind(storage_limit_mb)
    .fetch_one(&mut **tx)
    .await
    .map_err(map_unique_violation)?;

    Ok(organization)
}

/// Updates subscription tier and limits for an organization.
pub async fn update_organization_subscription(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    subscription_tier: SubscriptionTier,
    max_members: i32,
    max_boards: i32,
    storage_limit_mb: i32,
) -> Result<Organization, AppError> {
    let organization = sqlx::query_as(
        r#"
            UPDATE core.organization
            SET
                subscription_tier = $2,
                max_members = $3,
                max_boards = $4,
                storage_limit_mb = $5,
                updated_at = NOW()
            WHERE id = $1
            AND deleted_at IS NULL
            RETURNING *
        "#,
    )
    .bind(organization_id)
    .bind(subscription_tier)
    .bind(max_members)
    .bind(max_boards)
    .bind(storage_limit_mb)
    .fetch_one(&mut **tx)
    .await?;

    Ok(organization)
}

/// Adds the creator as an owner in core.organization_member.
pub async fn add_owner_member(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            INSERT INTO core.organization_member (
                organization_id,
                user_id,
                role,
                invited_by,
                invited_at,
                accepted_at
            )
            VALUES ($1, $2, $3, $4, NOW(), NOW())
        "#,
    )
    .bind(organization_id)
    .bind(user_id)
    .bind(OrgRole::Owner)
    .bind(user_id)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

/// Returns true when the organization member already exists.
pub async fn organization_member_exists(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    user_id: Uuid,
) -> Result<bool, AppError> {
    let exists = sqlx::query_scalar::<_, bool>(
        r#"
            SELECT EXISTS(
                SELECT 1
                FROM core.organization_member
                WHERE organization_id = $1
                AND user_id = $2
            )
        "#,
    )
    .bind(organization_id)
    .bind(user_id)
    .fetch_one(&mut **tx)
    .await?;

    Ok(exists)
}

/// Adds an invited member entry to core.organization_member.
pub async fn add_member_invite(
    tx: &mut Transaction<'_, Postgres>,
    organization_id: Uuid,
    user_id: Uuid,
    role: OrgRole,
    invited_by: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
            INSERT INTO core.organization_member (
                organization_id,
                user_id,
                role,
                invited_by,
                invited_at
            )
            VALUES ($1, $2, $3, $4, NOW())
        "#,
    )
    .bind(organization_id)
    .bind(user_id)
    .bind(role)
    .bind(invited_by)
    .execute(&mut **tx)
    .await
    .map_err(map_member_unique_violation)?;

    Ok(())
}

fn map_unique_violation(err: sqlx::Error) -> AppError {
    match &err {
        sqlx::Error::Database(db_err) => {
            if db_err.code().as_deref() == Some("23505") {
                return AppError::Conflict("Organization slug already exists".to_string());
            }
            AppError::Database(err)
        }
        _ => err.into(),
    }
}

fn map_member_unique_violation(err: sqlx::Error) -> AppError {
    match &err {
        sqlx::Error::Database(db_err) => {
            if db_err.code().as_deref() == Some("23505") {
                return AppError::Conflict("Organization member already exists".to_string());
            }
            AppError::Database(err)
        }
        _ => err.into(),
    }
}

fn map_invite_unique_violation(err: sqlx::Error) -> AppError {
    match &err {
        sqlx::Error::Database(db_err) => {
            if db_err.code().as_deref() == Some("23505") {
                return AppError::Conflict("Organization invite already exists".to_string());
            }
            AppError::Database(err)
        }
        _ => err.into(),
    }
}

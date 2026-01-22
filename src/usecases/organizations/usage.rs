use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    dto::organizations::OrganizationUsageResponse,
    error::AppError,
    repositories::{boards as board_repo, organizations as org_repo},
};

use super::{helpers::require_member_role, OrganizationService};

#[derive(Debug, Clone, Copy)]
pub(super) struct OrganizationUsageSnapshot {
    pub(super) members_used: i64,
    pub(super) boards_used: i64,
    pub(super) storage_used_mb: i32,
}

impl OrganizationService {
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
}

pub(super) async fn load_usage_snapshot(
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

pub(super) fn is_usage_over_limit(current: i64, limit: i32) -> bool {
    if limit <= 0 {
        return false;
    }

    current > i64::from(limit)
}

pub(super) fn is_usage_warning(current: i64, limit: i32) -> bool {
    if limit <= 0 {
        return false;
    }

    current.saturating_mul(100) >= i64::from(limit).saturating_mul(80)
}

#[cfg(test)]
mod tests {
    use super::{is_usage_over_limit, is_usage_warning};

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
}

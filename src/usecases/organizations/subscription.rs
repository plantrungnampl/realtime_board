use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    dto::organizations::{OrganizationResponse, UpdateOrganizationSubscriptionRequest},
    error::AppError,
    models::users::SubscriptionTier,
    repositories::organizations as org_repo,
};

use super::{
    OrganizationService,
    helpers::{ensure_owner, require_member_role},
    usage::{OrganizationUsageSnapshot, is_usage_over_limit, load_usage_snapshot},
};

#[derive(Debug, Clone, Copy)]
pub(super) struct OrganizationLimits {
    pub(super) max_members: i32,
    pub(super) max_boards: i32,
    pub(super) storage_limit_mb: i32,
}

impl OrganizationService {
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
}

pub(super) fn organization_limits_for_tier(tier: SubscriptionTier) -> OrganizationLimits {
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

pub(crate) fn max_boards_for_tier(tier: SubscriptionTier) -> i32 {
    organization_limits_for_tier(tier).max_boards
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

#[cfg(test)]
mod tests {
    use super::organization_limits_for_tier;
    use crate::models::users::SubscriptionTier;

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

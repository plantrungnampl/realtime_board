use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    dto::organizations::{
        CreateOrganizationRequest, OrganizationListResponse, OrganizationResponse,
        OrganizationSummaryResponse, SlugAvailabilityResponse,
    },
    error::AppError,
    models::users::SubscriptionTier,
    repositories::organizations as org_repo,
};

mod helpers;
mod invites;
mod members;
mod subscription;
mod usage;

/// Business logic for organization management.
pub struct OrganizationService;

pub(crate) use invites::send_invite_emails;
pub(crate) use subscription::max_boards_for_tier;

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

        let slug = helpers::build_slug(req.slug.as_deref(), name)?;
        if org_repo::organization_slug_exists(pool, &slug).await? {
            return Err(AppError::Conflict(
                "Organization slug already exists".to_string(),
            ));
        }

        let subscription_tier = req.subscription_tier.unwrap_or(SubscriptionTier::Free);
        let limits = subscription::organization_limits_for_tier(subscription_tier);
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

        let normalized = helpers::normalize_slug(trimmed);
        if !helpers::is_valid_slug(&normalized) {
            return Err(AppError::ValidationError(
                "Organization slug must be 3-100 lowercase characters, digits, or hyphens"
                    .to_string(),
            ));
        }

        let available = !org_repo::organization_slug_exists(pool, &normalized).await?;
        let suggestions = if available {
            Vec::new()
        } else {
            helpers::suggest_slugs(pool, &normalized).await?
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
}

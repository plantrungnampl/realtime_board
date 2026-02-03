use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;

use crate::models::organizations::{OrgRole, Organization};
use crate::models::users::SubscriptionTier;

/// Request payload for creating an organization.
#[derive(Debug, Clone, Deserialize)]
pub struct CreateOrganizationRequest {
    pub name: String,
    pub slug: Option<String>,
    pub description: Option<String>,
    pub logo_url: Option<String>,
    pub subscription_tier: Option<SubscriptionTier>,
}

/// Response payload for an organization summary.
#[derive(Debug, Clone, Serialize)]
pub struct OrganizationResponse {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub logo_url: Option<String>,
    pub subscription_tier: SubscriptionTier,
    pub max_members: i32,
    pub max_boards: i32,
    pub storage_limit_mb: i32,
    pub created_at: DateTime<Utc>,
}

/// Response payload for organization resource usage.
#[derive(Debug, Serialize)]
pub struct OrganizationUsageResponse {
    pub members_used: i64,
    pub members_limit: i32,
    pub boards_used: i64,
    pub boards_limit: i32,
    pub storage_used_mb: i32,
    pub storage_limit_mb: i32,
    pub members_warning: bool,
    pub boards_warning: bool,
    pub storage_warning: bool,
}

/// Summary payload for listing organizations the user belongs to.
#[derive(Debug, Clone, Serialize)]
pub struct OrganizationSummaryResponse {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub role: OrgRole,
}

/// Response payload for listing organizations.
#[derive(Debug, Serialize)]
pub struct OrganizationListResponse {
    pub data: Vec<OrganizationSummaryResponse>,
}

/// Member user payload for organization member list.
#[derive(Debug, Serialize)]
pub struct OrganizationMemberUser {
    pub id: Uuid,
    pub username: String,
    pub display_name: String,
    pub avatar_url: Option<String>,
}

/// Organization member payload.
#[derive(Debug, Serialize)]
pub struct OrganizationMemberResponse {
    pub id: Uuid,
    pub user: OrganizationMemberUser,
    pub role: OrgRole,
    pub invited_at: Option<DateTime<Utc>>,
    pub accepted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Response payload for organization members.
#[derive(Debug, Serialize)]
pub struct OrganizationMembersResponse {
    pub data: Vec<OrganizationMemberResponse>,
}

/// Organization info included in invitation responses.
#[derive(Debug, Serialize)]
pub struct OrganizationInvitationOrganization {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
}

/// Invitation payload for pending organization invites.
#[derive(Debug, Serialize)]
pub struct OrganizationInvitationResponse {
    pub member_id: Uuid,
    pub organization: OrganizationInvitationOrganization,
    pub role: OrgRole,
    pub invited_at: Option<DateTime<Utc>>,
}

/// Response payload for pending invitations.
#[derive(Debug, Serialize)]
pub struct OrganizationInvitationsResponse {
    pub data: Vec<OrganizationInvitationResponse>,
}

/// Query parameters for validating pre-signup invites.
#[derive(Deserialize)]
pub struct InviteValidationQuery {
    pub token: String,
    pub email: String,
}

impl fmt::Debug for InviteValidationQuery {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("InviteValidationQuery")
            .field("token", &"***")
            .field("email", &self.email)
            .finish()
    }
}

/// Response payload for invite validation.
#[derive(Debug, Serialize)]
pub struct InviteValidationResponse {
    pub organization: OrganizationInvitationOrganization,
    pub role: OrgRole,
    pub invite_expires_at: Option<DateTime<Utc>>,
}

/// Email invite payload for organization pre-signup invites.
#[derive(Debug, Serialize)]
pub struct OrganizationEmailInviteResponse {
    pub id: Uuid,
    pub email: String,
    pub role: OrgRole,
    pub invited_at: Option<DateTime<Utc>>,
    pub invite_expires_at: Option<DateTime<Utc>>,
}

/// Response payload for organization email invites.
#[derive(Debug, Serialize)]
pub struct OrganizationEmailInvitesResponse {
    pub data: Vec<OrganizationEmailInviteResponse>,
}

/// Request payload for updating a member role.
#[derive(Debug, Deserialize)]
pub struct UpdateMemberRoleRequest {
    pub role: OrgRole,
}

/// Request payload for updating organization subscription tier.
#[derive(Debug, Deserialize)]
pub struct UpdateOrganizationSubscriptionRequest {
    pub subscription_tier: SubscriptionTier,
}

/// Response payload for simple action messages.
#[derive(Debug, Serialize)]
pub struct OrganizationActionMessage {
    pub message: String,
}

/// Query parameters for slug availability checks.
#[derive(Debug, Deserialize)]
pub struct SlugAvailabilityQuery {
    pub slug: String,
}

/// Response payload for slug availability checks.
#[derive(Debug, Serialize)]
pub struct SlugAvailabilityResponse {
    pub slug: String,
    pub available: bool,
    pub adjusted: bool,
    pub suggestions: Vec<String>,
}

/// Request payload for inviting organization members.
#[derive(Debug, Deserialize)]
pub struct InviteMembersRequest {
    pub email: Option<String>,
    pub emails: Option<Vec<String>>,
    pub role: Option<OrgRole>,
}

/// Response payload for invite results.
#[derive(Debug, Serialize)]
pub struct InviteMembersResponse {
    pub invited: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub pending: Vec<String>,
}

impl From<Organization> for OrganizationResponse {
    fn from(organization: Organization) -> Self {
        Self {
            id: organization.id,
            name: organization.name,
            slug: organization.slug,
            description: organization.description,
            logo_url: organization.logo_url,
            subscription_tier: organization.subscription_tier,
            max_members: organization.max_members,
            max_boards: organization.max_boards,
            storage_limit_mb: organization.storage_limit_mb,
            created_at: organization.created_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_redacts_invite_validation_query() {
        let req = InviteValidationQuery {
            token: "secret_invite_token".to_string(),
            email: "test@example.com".to_string(),
        };
        let debug_output = format!("{:?}", req);
        assert!(debug_output.contains("token"));
        assert!(debug_output.contains("***"));
        assert!(!debug_output.contains("secret_invite_token"));
        assert!(debug_output.contains("email"));
        assert!(debug_output.contains("test@example.com"));
    }
}

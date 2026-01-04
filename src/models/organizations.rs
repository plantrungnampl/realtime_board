use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::prelude::FromRow;
use uuid::Uuid;

use crate::models::users::SubscriptionTier;

/// Organization member role mapping for core.org_role.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, sqlx::Type, PartialEq)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "core.org_role", rename_all = "lowercase")]
pub enum OrgRole {
    Owner,
    Admin,
    Member,
    Guest,
}

/// Organization settings stored as JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationSettings {
    pub allow_public_boards: bool,
    pub default_board_permission: String,
    pub sso_enabled: bool,
    pub domain_restriction: Option<String>,
}

/// Organization model mapped to core.organization.
#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Organization {
    pub id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub logo_url: Option<String>,

    #[sqlx(json)]
    pub settings: OrganizationSettings,

    pub subscription_tier: SubscriptionTier,
    pub subscription_expires_at: Option<DateTime<Utc>>,
    pub max_members: i32,
    pub max_boards: i32,
    pub storage_limit_mb: i32,
    pub storage_used_mb: i32,

    pub billing_email: Option<String>,
    pub billing_address: Option<serde_json::Value>,

    #[sqlx(json)]
    pub metadata: serde_json::Value,

    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

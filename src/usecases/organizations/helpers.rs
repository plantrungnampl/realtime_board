use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{organizations::OrgRole, users::User},
    repositories::{organizations as org_repo, users as user_repo},
};

pub(super) fn build_slug(provided: Option<&str>, name: &str) -> Result<String, AppError> {
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

pub(super) fn normalize_slug(value: &str) -> String {
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

pub(super) fn is_valid_slug(slug: &str) -> bool {
    let len = slug.chars().count();
    if !(3..=100).contains(&len) {
        return false;
    }

    slug.chars()
        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '-')
}

pub(super) fn normalize_invite_role(role: Option<OrgRole>) -> Result<OrgRole, AppError> {
    let role = role.unwrap_or(OrgRole::Member);
    if matches!(role, OrgRole::Owner) {
        return Err(AppError::ValidationError(
            "Owner role cannot be assigned via invite".to_string(),
        ));
    }
    Ok(role)
}

pub(super) async fn require_member_role(
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

pub(super) fn ensure_manager(role: OrgRole) -> Result<(), AppError> {
    match role {
        OrgRole::Owner | OrgRole::Admin => Ok(()),
        _ => Err(AppError::Forbidden(
            "You do not have permission to manage members".to_string(),
        )),
    }
}

pub(super) fn ensure_owner(role: OrgRole) -> Result<(), AppError> {
    if role == OrgRole::Owner {
        return Ok(());
    }

    Err(AppError::Forbidden(
        "Only owners can update subscription settings".to_string(),
    ))
}

pub(super) async fn resolve_fallback_owner_id(
    pool: &PgPool,
    organization_id: Uuid,
    requester_id: Uuid,
    requester_role: OrgRole,
    removed_user_id: Uuid,
) -> Result<Uuid, AppError> {
    if requester_role == OrgRole::Owner && requester_id != removed_user_id {
        return Ok(requester_id);
    }

    org_repo::find_owner_user_id(pool, organization_id, removed_user_id)
        .await?
        .ok_or(AppError::BadRequest(
            "No organization owner available to transfer board ownership".to_string(),
        ))
}

pub(super) fn ensure_member_capacity(
    current: i64,
    additional: i64,
    limit: i32,
) -> Result<(), AppError> {
    if is_limit_exceeded(current, additional, limit) {
        return Err(AppError::LimitExceeded(
            "Organization member limit reached".to_string(),
        ));
    }

    Ok(())
}

pub(super) fn is_limit_exceeded(current: i64, additional: i64, limit: i32) -> bool {
    if limit <= 0 {
        return false;
    }

    current.saturating_add(additional) > i64::from(limit)
}

pub(super) async fn split_invite_targets(
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

pub(super) async fn suggest_slugs(pool: &PgPool, base: &str) -> Result<Vec<String>, AppError> {
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

#[cfg(test)]
mod tests {
    use super::{build_slug, is_limit_exceeded, is_valid_slug, normalize_slug};

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
}

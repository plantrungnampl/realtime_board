use serde::Serialize;
use tracing::info;
use uuid::Uuid;

#[derive(Debug, Serialize)]
#[serde(tag = "event_type")]
pub enum BusinessEvent {
    UserRegistered {
        user_id: Uuid,
        email_redacted: String,
    },
    UserLoggedIn {
        user_id: Uuid,
    },
    LoginFailed {
        email_redacted: String,
        reason: String,
    },
    EmailVerified {
        user_id: Uuid,
    },
    BoardCreated {
        board_id: Uuid,
        user_id: Uuid,
        organization_id: Option<Uuid>,
        is_template: bool,
    },
    BoardUpdated {
        board_id: Uuid,
        user_id: Uuid,
        fields: Vec<String>,
    },
    BoardDeleted {
        board_id: Uuid,
        user_id: Uuid,
    },
    BoardShared {
        board_id: Uuid,
        shared_by: Uuid,
        shared_with: Uuid,
        role: String,
    },
    OrganizationCreated {
        org_id: Uuid,
        owner_id: Uuid,
    },
    MemberInvited {
        org_id: Uuid,
        inviter_id: Uuid,
        invitee_email_redacted: String,
    },
    MemberJoined {
        org_id: Uuid,
        user_id: Uuid,
    },
    MemberRemoved {
        org_id: Uuid,
        removed_by: Uuid,
        removed_user: Uuid,
    },
    CrdtSnapshotSaved {
        board_id: Uuid,
        snapshot_size: usize,
        update_count: usize,
    },
    CrdtProjectionCompleted {
        board_id: Uuid,
        elements_synced: usize,
    },
}

pub fn redact_email(email: &str) -> String {
    let trimmed = email.trim();
    if trimmed.is_empty() {
        return "***".to_string();
    }
    let mut parts = trimmed.splitn(2, '@');
    let local = parts.next().unwrap_or("");
    let domain = parts.next().unwrap_or("");
    if local.is_empty() || domain.is_empty() {
        return "***".to_string();
    }
    let first_char = local.chars().next().unwrap_or('*');
    format!("{first_char}***@{domain}")
}

impl BusinessEvent {
    pub fn log(&self) {
        let event_json = serde_json::to_string(self).unwrap_or_else(|_| format!("{:?}", self));
        info!(
            target: "business_events",
            event = %event_json,
            "Business event occurred"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::redact_email;

    #[test]
    fn redacts_valid_email() {
        assert_eq!(redact_email("user@example.com"), "u***@example.com");
    }

    #[test]
    fn redacts_missing_domain() {
        assert_eq!(redact_email("invalid"), "***");
    }

    #[test]
    fn redacts_empty_value() {
        assert_eq!(redact_email(""), "***");
    }
}

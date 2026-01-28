use std::collections::HashSet;

use crate::error::AppError;

pub(crate) const DEFAULT_INVITE_EMAIL_LIMIT: usize = 25;

pub(crate) fn collect_invite_emails(
    email: Option<String>,
    email_list: Option<Vec<String>>,
    limit_override: Option<usize>,
) -> Result<Vec<String>, AppError> {
    let emails = merge_invite_emails(email, email_list);
    let cleaned = normalize_invite_emails(emails)?;
    enforce_invite_email_limit(cleaned.len(), limit_override)?;
    validate_invite_emails(&cleaned)?;
    Ok(cleaned)
}

fn merge_invite_emails(email: Option<String>, email_list: Option<Vec<String>>) -> Vec<String> {
    let mut emails = Vec::new();
    if let Some(email) = email {
        emails.push(email);
    }
    if let Some(list) = email_list {
        emails.extend(list);
    }
    emails
}

fn normalize_invite_emails(emails: Vec<String>) -> Result<Vec<String>, AppError> {
    let mut unique = HashSet::new();
    let mut cleaned = Vec::new();
    for email in emails {
        let trimmed = email.trim();
        if trimmed.is_empty() {
            continue;
        }
        let normalized = trimmed.to_lowercase();
        if !unique.insert(normalized.clone()) {
            return Err(AppError::ValidationError(format!(
                "Duplicate email in invite list: {}",
                normalized
            )));
        }
        cleaned.push(normalized);
    }

    if cleaned.is_empty() {
        return Err(AppError::ValidationError(
            "At least one email is required".to_string(),
        ));
    }

    Ok(cleaned)
}

fn enforce_invite_email_limit(
    count: usize,
    limit_override: Option<usize>,
) -> Result<(), AppError> {
    let limit = limit_override.unwrap_or(DEFAULT_INVITE_EMAIL_LIMIT);
    if count > limit {
        return Err(AppError::ValidationError(format!(
            "Invite email limit exceeded (max {})",
            limit
        )));
    }
    Ok(())
}

fn validate_invite_emails(emails: &[String]) -> Result<(), AppError> {
    let invalid: Vec<String> = emails
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
    Ok(())
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
    use super::*;

    fn assert_validation_error_contains(
        result: Result<Vec<String>, AppError>,
        expected: &str,
    ) {
        match result {
            Err(AppError::ValidationError(message)) => {
                assert!(
                    message.contains(expected),
                    "expected validation error containing '{expected}', got '{message}'"
                );
            }
            Err(other) => panic!("expected validation error, got {other:?}"),
            Ok(value) => panic!("expected error, got {value:?}"),
        }
    }

    #[test]
    fn normalizes_and_lowercases_emails() {
        let result = collect_invite_emails(
            Some("  Alice@Example.com  ".to_string()),
            Some(vec![" Bob@Example.com".to_string()]),
            None,
        );

        assert_eq!(
            result.unwrap(),
            vec!["alice@example.com".to_string(), "bob@example.com".to_string()]
        );
    }

    #[test]
    fn rejects_duplicate_emails_after_normalization() {
        let result = collect_invite_emails(
            Some("Test@Example.com".to_string()),
            Some(vec![" test@example.com ".to_string()]),
            None,
        );

        assert_validation_error_contains(result, "Duplicate email in invite list");
    }

    #[test]
    fn rejects_invalid_emails() {
        let result = collect_invite_emails(None, Some(vec!["invalid".to_string()]), None);

        assert_validation_error_contains(result, "Invalid email(s)");
    }

    #[test]
    fn rejects_empty_email_list() {
        let result = collect_invite_emails(None, Some(vec!["   ".to_string()]), None);

        assert_validation_error_contains(result, "At least one email is required");
    }

    #[test]
    fn rejects_when_invite_list_exceeds_limit() {
        let result = collect_invite_emails(
            None,
            Some(vec![
                "first@example.com".to_string(),
                "second@example.com".to_string(),
                "third@example.com".to_string(),
            ]),
            Some(2),
        );

        assert_validation_error_contains(result, "Invite email limit exceeded");
    }
}

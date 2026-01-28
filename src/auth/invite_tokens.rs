use sha2::{Digest, Sha256};
use uuid::Uuid;

pub fn generate_invite_token() -> String {
    Uuid::new_v4().simple().to_string()
}

pub fn hash_invite_token(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_invite_token_is_deterministic() {
        let token = "test-token";
        let first = hash_invite_token(token);
        let second = hash_invite_token(token);
        assert_eq!(first, second);
    }

    #[test]
    fn hash_invite_token_has_expected_length() {
        let token = "test-token";
        let hashed = hash_invite_token(token);
        assert_eq!(hashed.len(), 64);
    }

    #[test]
    fn hash_invite_token_differs_for_different_tokens() {
        let first = hash_invite_token("token-a");
        let second = hash_invite_token("token-b");
        assert_ne!(first, second);
    }

    #[test]
    fn generate_invite_token_returns_non_empty_value() {
        let token = generate_invite_token();
        assert!(!token.trim().is_empty());
    }
}

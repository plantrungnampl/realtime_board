use argon2::PasswordHasher;
use argon2::{
    Argon2, PasswordHash, PasswordVerifier,
    password_hash::{SaltString, rand_core::OsRng},
};
use chrono::{Duration, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub(crate) sub: String,
    pub exp: i64,
    pub email: String,
    pub iat: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iss: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aud: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub typ: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EmailVerificationClaims {
    pub sub: String,
    pub exp: i64,
    pub email: String,
    pub iat: i64,
    pub typ: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iss: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aud: Option<String>,
}
#[derive(Clone)]
pub struct JwtConfig {
    pub secret: String,
    pub expiration_hours: i64,
    pub issuer: Option<String>,
    pub audience: Option<String>,
}
impl JwtConfig {
    pub fn from_env(secret: String) -> Self {
        let expiration_hours = std::env::var("JWT_EXPIRATION_HOURS")
            .ok()
            .and_then(|value| value.parse::<i64>().ok())
            .filter(|value| *value > 0)
            .unwrap_or(24);
        let issuer = std::env::var("JWT_ISSUER")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let audience = std::env::var("JWT_AUDIENCE")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        Self {
            secret,
            expiration_hours,
            issuer,
            audience,
        }
    }

    pub fn create_token(
        &self,
        user_id: Uuid,
        email: String,
    ) -> Result<String, jsonwebtoken::errors::Error> {
        let now = Utc::now();
        let exp = now + Duration::hours(self.expiration_hours);
        let claim = Claims {
            sub: user_id.to_string(),
            email,
            exp: exp.timestamp(),
            iat: now.timestamp(),
            iss: self.issuer.clone(),
            aud: self.audience.clone(),
            typ: Some("access".to_string()),
        };
        encode(
            &Header::new(Algorithm::HS256),
            &claim,
            &EncodingKey::from_secret(self.secret.as_bytes()),
        )
    }
    pub fn verify_token(&self, token: &str) -> Result<Claims, jsonwebtoken::errors::Error> {
        let mut validation = Validation::new(Algorithm::HS256);
        if let Some(issuer) = &self.issuer {
            validation.set_issuer(&[issuer]);
        }
        if let Some(audience) = &self.audience {
            validation.set_audience(&[audience]);
        }
        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(self.secret.as_bytes()),
            &validation,
        )?;
        if let Some(typ) = &token_data.claims.typ {
            if typ != "access" {
                return Err(jsonwebtoken::errors::ErrorKind::InvalidToken.into());
            }
        }
        Ok(token_data.claims)
    }

    pub fn create_email_verification_token(
        &self,
        user_id: Uuid,
        email: String,
    ) -> Result<String, jsonwebtoken::errors::Error> {
        let now = Utc::now();
        let exp = now + Duration::hours(self.expiration_hours);
        let claim = EmailVerificationClaims {
            sub: user_id.to_string(),
            email,
            exp: exp.timestamp(),
            iat: now.timestamp(),
            typ: "email_verification".to_string(),
            iss: self.issuer.clone(),
            aud: self.audience.clone(),
        };
        encode(
            &Header::new(Algorithm::HS256),
            &claim,
            &EncodingKey::from_secret(self.secret.as_bytes()),
        )
    }

    pub fn verify_email_verification_token(
        &self,
        token: &str,
    ) -> Result<EmailVerificationClaims, jsonwebtoken::errors::Error> {
        let mut validation = Validation::new(Algorithm::HS256);
        if let Some(issuer) = &self.issuer {
            validation.set_issuer(&[issuer]);
        }
        if let Some(audience) = &self.audience {
            validation.set_audience(&[audience]);
        }
        let token_data = decode::<EmailVerificationClaims>(
            token,
            &DecodingKey::from_secret(self.secret.as_bytes()),
            &validation,
        )?;
        if token_data.claims.typ != "email_verification" {
            return Err(jsonwebtoken::errors::ErrorKind::InvalidToken.into());
        }
        Ok(token_data.claims)
    }
}

pub fn hash_password(passoword: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let password_hash = argon2.hash_password(passoword.as_bytes(), &salt)?;
    Ok(password_hash.to_string())
}
pub fn verify_password_user(
    passoword: &str,
    hash_db: &str,
) -> Result<bool, argon2::password_hash::Error> {
    let parsed_hash = PasswordHash::new(hash_db)?;
    let argon2 = Argon2::default();
    let is_valid = argon2
        .verify_password(passoword.as_bytes(), &parsed_hash)
        .is_ok();
    Ok(is_valid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_email_verification_token_as_auth_token_vulnerability() {
        let config = JwtConfig {
            secret: "secret".to_string(),
            expiration_hours: 1,
            issuer: None,
            audience: None,
        };
        let user_id = Uuid::new_v4();
        let email = "test@example.com".to_string();

        // Create an email verification token
        let token = config.create_email_verification_token(user_id, email.clone()).unwrap();

        // Attempt to verify it as an auth token
        let claims = config.verify_token(&token);

        // VULNERABILITY: This should fail, but currently succeeds
        assert!(claims.is_err(), "Email verification token was accepted as auth token!");
    }

    #[test]
    fn test_valid_auth_token() {
        let config = JwtConfig {
            secret: "secret".to_string(),
            expiration_hours: 1,
            issuer: None,
            audience: None,
        };
        let user_id = Uuid::new_v4();
        let email = "test@example.com".to_string();

        // Create a valid auth token
        let token = config.create_token(user_id, email.clone()).unwrap();

        // Verify it
        let claims = config.verify_token(&token);
        assert!(claims.is_ok());

        let claims = claims.unwrap();
        assert_eq!(claims.sub, user_id.to_string());
        assert_eq!(claims.email, email);
        assert_eq!(claims.typ, Some("access".to_string()));
    }
}

use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    message::{Mailbox, SinglePart, header::ContentType},
    transport::smtp::authentication::Credentials,
};
use std::env;

use crate::error::AppError;

#[derive(Clone)]
pub struct EmailService {
    mailer: AsyncSmtpTransport<Tokio1Executor>,
    from: Mailbox,
    frontend_url: String,
}

impl EmailService {
    pub fn from_env() -> Result<Self, String> {
        let host = get_env("SMTP_HOST")?;
        let port = env::var("SMTP_PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(587);
        let username = get_env("SMTP_USERNAME")?;
        let password = get_env("SMTP_PASSWORD")?;
        let from_email = get_env("SMTP_FROM")?;
        let from_name =
            env::var("SMTP_FROM_NAME").unwrap_or_else(|_| "Real-time Board".to_string());
        let frontend_url =
            env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:5173".to_string());

        let from_address = from_email
            .parse()
            .map_err(|_| "SMTP_FROM must be a valid email address".to_string())?;
        let from = Mailbox::new(Some(from_name), from_address);
        let creds = Credentials::new(username, password);
        let mailer = AsyncSmtpTransport::<Tokio1Executor>::relay(&host)
            .map_err(|e| format!("SMTP relay error: {}", e))?
            .port(port)
            .credentials(creds)
            .build();

        Ok(Self {
            mailer,
            from,
            frontend_url,
        })
    }

    pub async fn send_verification_email(
        &self,
        recipient: &str,
        token: &str,
    ) -> Result<(), AppError> {
        let verify_link = format!(
            "{}/verify-email?token={}",
            self.frontend_url.trim_end_matches('/'),
            urlencoding::encode(token)
        );

        let body = format!(
            "Welcome to Real-time Board!\n\nVerify your email by clicking the link below:\n{}\n\nIf you did not create an account, you can ignore this email.",
            verify_link
        );

        let to_address = recipient
            .parse()
            .map_err(|_| AppError::BadRequest("Invalid recipient email".to_string()))?;
        let message = Message::builder()
            .from(self.from.clone())
            .to(Mailbox::new(None, to_address))
            .subject("Verify your email")
            .singlepart(
                SinglePart::builder()
                    .header(ContentType::TEXT_PLAIN)
                    .body(body),
            )
            .map_err(|e| AppError::ExternalService(format!("Email build failed: {}", e)))?;

        self.mailer
            .send(message)
            .await
            .map_err(|e| AppError::ExternalService(format!("Email send failed: {}", e)))?;
        Ok(())
    }

    /// Sends an organization invite email to a recipient.
    pub async fn send_organization_invite(
        &self,
        recipient: &str,
        organization_name: &str,
        organization_slug: &str,
        invite_token: Option<&str>,
    ) -> Result<(), AppError> {
        let base_url = self.frontend_url.trim_end_matches('/');
        let action_link = match invite_token {
            Some(token) => format!(
                "{}/register?invite={}&email={}",
                base_url,
                urlencoding::encode(token),
                urlencoding::encode(recipient)
            ),
            None => format!(
                "{}/invitations?email={}",
                base_url,
                urlencoding::encode(recipient)
            ),
        };

        let body = format!(
            "You have been invited to join the \"{}\" workspace.\n\nWorkspace URL: {}\n\nSign in or create an account to accept the invitation:\n{}\n\nIf you did not expect this invite, you can ignore this email.",
            organization_name, organization_slug, action_link
        );

        let to_address = recipient
            .parse()
            .map_err(|_| AppError::BadRequest("Invalid recipient email".to_string()))?;
        let message = Message::builder()
            .from(self.from.clone())
            .to(Mailbox::new(None, to_address))
            .subject(format!("Invite to {}", organization_name))
            .singlepart(
                SinglePart::builder()
                    .header(ContentType::TEXT_PLAIN)
                    .body(body),
            )
            .map_err(|e| AppError::ExternalService(format!("Email build failed: {}", e)))?;

        self.mailer
            .send(message)
            .await
            .map_err(|e| AppError::ExternalService(format!("Email send failed: {}", e)))?;
        Ok(())
    }
}

fn get_env(key: &str) -> Result<String, String> {
    env::var(key).map_err(|_| format!("Missing {}", key))
}

use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::users::{LoginRequest, LoginResponse, RegisterRequest, User, UserReponse},
    services::jwt::{JwtConfig, hash_password, verify_password_user},
};

pub struct UserServices;
impl UserServices {
    pub async fn register_user(
        pool: PgPool,
        req: RegisterRequest,
    ) -> Result<LoginResponse, AppError> {
        let check_email_exits = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS(SELECT 1 FROM core.user WHERE email = $1 AND deleted_at IS NULL)
        "#,
        )
        .bind(&req.email)
        .fetch_one(&pool)
        .await?;

        if check_email_exits {
            return Err(AppError::Conflict("Email already exists".to_string()));
        }

        let hash_password_user = hash_password(&req.password_hash).unwrap();

        //create user
        let user = sqlx::query_as::<_, User>(
            r#"
                INSERT INTO core.user(email, password_hash, display_name, username)
                VALUES ($1, $2, $3, $4)
                RETURNING *
            "#,
        )
        .bind(&req.email)
        .bind(&hash_password_user)
        .bind(&req.display_name)
        .bind(&req.username)
        .fetch_one(&pool)
        .await?;

        let jwt_config = JwtConfig::secret_env();
        let token = jwt_config
            .create_token(user.id, user.email.clone())
            .map_err(|e| AppError::Internal(format!("Failed to create token: {}", e)))?;

        Ok(LoginResponse {
            user: user.into(),
            token,
        })
    }
    pub async fn Login(pool: PgPool, req: LoginRequest) -> Result<LoginResponse, AppError> {
        let user = sqlx::query_as::<_, User>(
            r#"
                SELECT * FROM core.user WHERE email = $1 AND deleted_at IS NULL
            "#,
        )
        .bind(&req.email)
        .fetch_optional(&pool)
        .await?
        .ok_or(AppError::InvalidCredentials(
            "invalid creadentials".to_string(),
        ))?;
        let hash = user
            .password_hash
            .ok_or(AppError::Internal("password hash not found".to_string()))?;

        //verify password
        let verifypassword = verify_password_user(&req.password, &hash)
            .map_err(|_| AppError::InvalidCredentials("error password".to_string()))?;
        if !verifypassword {
            return Err(AppError::InvalidCredentials("error pass".to_string()));
        }
        if !user.is_active {
            return Err(AppError::InvalidCredentials(
                "invalid creadential".to_string(),
            ));
        }

        sqlx::query("UPDATE core.user SET last_active_at = CURRENT_TIMESTAMP WHERE id  = $1")
            .bind(user.id)
            .execute(&pool)
            .await?;
        let jwt_config = JwtConfig::secret_env();
        let token = jwt_config
            .create_token(user.id, user.email.clone())
            .map_err(|e| AppError::Internal(format!("Failed to create token: {}", e)))?;

        Ok(LoginResponse {
            token,
            user: UserReponse {
                id: user.id,
                email: user.email,
                username: user.username.expect("null"),
                display_name: user.display_name,
                avatar_url: user.avatar_url,
            },
        })
    }

    pub async fn get_user_by_id(pool: PgPool, user_id: Uuid) -> Result<User, AppError> {
        let user = sqlx::query_as::<_, User>(
            r#"
            SELECT * FROM core.user WHERE id = $1 AND deleted_at IS NULL
            "#,
        )
        .bind(user_id)
        .fetch_one(&pool)
        .await?;
        Ok(user)
    }
}

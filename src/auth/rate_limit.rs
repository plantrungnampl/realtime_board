use crate::app::state::AppState;
use axum::{
    extract::{ConnectInfo, Request, State},
    http::StatusCode,
    middleware::Next,
    response::Response,
};
use redis::AsyncCommands;
use std::net::SocketAddr;

pub async fn rate_limit_middleware(
    State(state): State<AppState>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    if let Some(client) = &state.redis {
        match client.get_multiplexed_async_connection().await {
            Ok(mut conn) => {
                let ip = addr.ip().to_string();
                let path = req.uri().path().to_string();
                let key = format!("rate_limit:{}:{}", path, ip);

                // Rate limit: 10 requests per minute
                let count: u64 = match conn.incr(&key, 1).await {
                    Ok(c) => c,
                    Err(e) => {
                        tracing::error!("Redis incr error: {}", e);
                        // Fail open if Redis fails
                        return Ok(next.run(req).await);
                    }
                };

                if count == 1 {
                    if let Err(e) = conn.expire::<_, ()>(&key, 60).await {
                        tracing::error!("Redis expire error: {}", e);
                    }
                }

                if count > 10 {
                    return Err(StatusCode::TOO_MANY_REQUESTS);
                }
            }
            Err(e) => {
                tracing::error!("Redis connection error: {}", e);
                // Fail open
            }
        }
    }

    Ok(next.run(req).await)
}

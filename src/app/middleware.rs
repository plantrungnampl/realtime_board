use axum::{
    extract::Request,
    http::{HeaderValue, header},
    middleware::Next,
    response::Response,
};

pub async fn security_headers(req: Request, next: Next) -> Response {
    let mut response = next.run(req).await;
    let headers = response.headers_mut();

    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );

    headers.insert(
        header::X_FRAME_OPTIONS,
        HeaderValue::from_static("DENY"),
    );

    headers.insert(
        header::X_XSS_PROTECTION,
        HeaderValue::from_static("1; mode=block"),
    );

    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );

    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        Router,
        body::Body,
        routing::get,
    };
    use tower::util::ServiceExt; // for `oneshot`

    #[tokio::test]
    async fn test_security_headers_middleware() {
        let app = Router::new()
            .route("/", get(|| async { "Hello, World!" }))
            .layer(axum::middleware::from_fn(security_headers));

        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        let headers = response.headers();

        assert_eq!(
            headers.get(header::X_CONTENT_TYPE_OPTIONS).unwrap(),
            "nosniff"
        );
        assert_eq!(
            headers.get(header::X_FRAME_OPTIONS).unwrap(),
            "DENY"
        );
        assert_eq!(
            headers.get(header::X_XSS_PROTECTION).unwrap(),
            "1; mode=block"
        );
        assert_eq!(
            headers.get(header::REFERRER_POLICY).unwrap(),
            "strict-origin-when-cross-origin"
        );
    }
}

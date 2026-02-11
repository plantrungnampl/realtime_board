## 2025-02-17 - Hardcoded JWT Secret Fallback

**Vulnerability:** The application contained a hardcoded fallback string (`"zxcsgdfhegrfjherfgjetj"`) for the `JWT_SECRET` environment variable in `src/app/state.rs`. If `JWT_SECRET` was not provided in the environment, the application would silently default to this known value, allowing attackers who know the source code to forge authentication tokens.

**Learning:** This fallback was likely introduced to simplify local development setup, ensuring the application wouldn't crash if configuration was missing. It highlights the risk of prioritizing developer convenience over "secure by default" principles.

**Prevention:**
1. Never provide default values for critical secrets.
2. Ensure the application fails to start (panics) if required secrets are missing.
3. Use `.env.example` files to document required configuration for developers, rather than embedding defaults in code.

## 2026-01-28 - User Enumeration via Login Error Messages

**Vulnerability:** The login endpoint returned different error messages for "User Not Found" (`invalid creadentials`), "Invalid Password" (`error pass`), and "Inactive Account" (`invalid creadential`). This allowed attackers to enumerate valid email addresses by observing the error response.

**Learning:** Developers often use specific error messages to help with debugging (or due to lack of standardization), failing to realize that this information can be exploited. Inconsistent spelling ("creadentials") also indicated a lack of code review/standards.

**Prevention:**
1. Always use a generic error message (e.g., "Invalid email or password") for all authentication failures.
2. Log the specific failure reason internally (as was done here correctly) but do not expose it to the client.
3. Be aware of timing attacks; although fixing the error message is the first step, ensuring constant-time execution is the complete fix.

## 2026-02-18 - Token Leakage via URL Query Parameters

**Vulnerability:** The default `auth_middleware` accepted authentication tokens via the `token` URL query parameter for all endpoints. This created a risk of token leakage in server logs, proxy logs, and browser history for standard REST API requests.

**Learning:** "Convenience" features like query parameter authentication (often needed for WebSockets) should not be enabled globally. Authentication middleware should be "secure by default" (strict, header-only) and only opt-in to flexible modes where strictly necessary.

**Prevention:**
1. Default to strict `Authorization` header checks for all REST endpoints.
2. Create separate middleware (e.g., `auth_middleware_flexible`) for specific routes like WebSockets that require query parameter support.
3. Apply the flexible middleware *only* to the specific routes that need it.

## 2026-02-19 - Secrets Exposure via Debug Trait

**Vulnerability:** Authentication DTOs (e.g., `LoginRequest`, `RegisterRequest`) derived the `Debug` trait, which would expose plaintext passwords and tokens if these objects were logged (e.g., in error traces or debug logs).

**Learning:** The convenience of `#[derive(Debug)]` often overrides security considerations. Developers might assume that "Debug" is safe or only for internal use, forgetting that logs can be persisted and viewed by others.

**Prevention:**
1. Identify structs containing sensitive data (passwords, tokens, keys).
2. Manually implement `std::fmt::Debug` for these structs.
3. Explicitly redact sensitive fields (e.g., print `***` instead of the value).
4. Add unit tests to verify that sensitive fields are redacted in debug output.

## 2026-02-19 - Missing Default Security Headers

**Vulnerability:** The application was missing standard HTTP security headers (e.g., `X-Frame-Options`, `X-Content-Type-Options`), which could leave users vulnerable to clickjacking and MIME-sniffing attacks.

**Learning:** Web frameworks like Axum do not inject security headers by default. Developers must explicitly add a middleware layer to enforce these protections globally.

**Prevention:**
1. Implement a `security_headers` middleware using `axum::middleware::from_fn`.
2. Apply `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `X-XSS-Protection: 1; mode=block`.
3. Register this middleware globally in the main router.

## 2026-02-20 - Rate Limiting DoS Risk behind Proxy

**Vulnerability:** The application used `PeerIpKeyExtractor` for authentication rate limiting. This extracts the immediate peer IP. In containerized environments (like Docker) or behind reverse proxies (Load Balancers), all traffic appears to come from the proxy's IP (e.g., Docker Gateway). This means a single user triggering the rate limit would block *all* users sharing that proxy, causing a Denial of Service.

**Learning:** "Default" configurations often assume direct exposure. When deploying in containers or behind proxies, identity extraction must be "proxy-aware".

**Prevention:**
1. Use `SmartIpKeyExtractor` (or similar) that respects `X-Forwarded-For` and `Forwarded` headers.
2. Ensure infrastructure (proxy) properly sets these headers and strips them from incoming untrusted traffic (to prevent spoofing).
3. Test rate limiting behavior in the actual deployment topology (or simulate proxy headers in tests).

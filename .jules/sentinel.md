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

## 2025-02-18 - Hardcoded Database Credentials

**Vulnerability:** The `docker-compose.yml` file contained hardcoded passwords for the PostgreSQL database (`Annam123@123`) and pgAdmin interface (`admin`). This exposes the database to unauthorized access if the file is committed to version control or leaks.

**Learning:** Configuration files like `docker-compose.yml` are often treated as "infrastructure as code" but can easily become sources of secret leakage if not carefully parameterized.

**Prevention:**
1. Always use environment variables for secrets in `docker-compose.yml` (`${VAR}`).
2. Provide a `.env.example` file with placeholders for these variables.
3. Use pre-commit hooks or CI scanners (like `git-secrets` or `trufflehog`) to detect secrets in configuration files.

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

## 2025-02-17 - Hardcoded JWT Secret Fallback

**Vulnerability:** The application contained a hardcoded fallback string (`"zxcsgdfhegrfjherfgjetj"`) for the `JWT_SECRET` environment variable in `src/app/state.rs`. If `JWT_SECRET` was not provided in the environment, the application would silently default to this known value, allowing attackers who know the source code to forge authentication tokens.

**Learning:** This fallback was likely introduced to simplify local development setup, ensuring the application wouldn't crash if configuration was missing. It highlights the risk of prioritizing developer convenience over "secure by default" principles.

**Prevention:**
1. Never provide default values for critical secrets.
2. Ensure the application fails to start (panics) if required secrets are missing.
3. Use `.env.example` files to document required configuration for developers, rather than embedding defaults in code.

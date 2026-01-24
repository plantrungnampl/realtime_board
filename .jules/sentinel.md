## 2026-01-24 - Hardcoded JWT Secret Fallback
**Vulnerability:** A hardcoded fallback string was used when `JWT_SECRET` environment variable was missing.
**Learning:** Developers sometimes add fallbacks for convenience during local development, but these can become dangerous backdoors if deployed to production without configuration.
**Prevention:** Critical security configuration like secrets should never have hardcoded defaults in the code. Use `.expect()` or similar mechanisms to fail fast if they are missing.

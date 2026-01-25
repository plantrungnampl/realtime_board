## 2025-10-21 - [CRITICAL] Hardcoded JWT Secret Fallback
**Vulnerability:** The application fell back to a hardcoded string "zxcsgdfhegrfjherfgjetj" when the `JWT_SECRET` environment variable was missing.
**Learning:** Hardcoded fallbacks for critical secrets defeat the purpose of environment variables and can leave deployments vulnerable if configuration is missed.
**Prevention:** Always `expect` or panic when critical security configuration is missing. Never provide insecure defaults for secrets.

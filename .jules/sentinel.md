## 2024-05-23 - Username Enumeration in Login
**Vulnerability:** The login endpoint returned distinct error messages for "User not found" (`"invalid creadentials"`) and "Invalid password" (`"error pass"`/`"error password"`).
**Learning:** Inconsistent error messages in authentication flows allow attackers to enumerate valid email addresses, which can be used for targeted attacks (e.g., credential stuffing, phishing).
**Prevention:** Always use a generic error message like "Invalid email or password" for all authentication failures to deny attackers information about account existence.

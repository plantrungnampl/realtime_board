# Palette's Journal

## 2024-05-23 - Presence Indicators Accessibility
**Learning:** User presence indicators (avatars) implemented as `div`s with `title` attributes are inaccessible to keyboard and screen reader users. They are a common pattern for "who is here".
**Action:** Enhance presence indicators by adding `tabIndex={0}`, `role="img"`, and descriptive `aria-label`s (e.g., "User Name (Status)"). Ensure visual focus indicators are present.

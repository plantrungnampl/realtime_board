## 2024-05-22 - Loading States in Forms
**Learning:** Adding immediate visual feedback (spinner) to form submission buttons significantly improves perceived performance and clarity, especially when backend latency is variable.
**Action:** Standardize `isLoading` prop on all actionable buttons (submit, delete, etc.) to ensure consistent feedback.

## 2024-05-23 - Form Accessibility & Interaction
**Learning:** Error messages without `role="alert"` are often missed by screen readers. Password fields without visibility toggles cause friction during registration.
**Action:** Always add `role="alert"` to form error containers and include accessible visibility toggles for password creation fields.

## 2024-10-24 - Playwright Locator Precision
**Learning:** Playwright's `get_by_label` uses substring matching by default. Labels like "Password" can incorrectly match buttons with labels like "Show password" or "Hide password", causing strict mode violations.
**Action:** Use `exact=True` (e.g., `get_by_label("Password", exact=True)`) when a label might be a substring of another accessible element's name.

## 2024-10-24 - Visual Consistency & Focus States
**Learning:** Inconsistent focus states between similar flows (e.g., Login vs Register) create a disjointed experience for keyboard users.
**Action:** Audit and align `focus-visible` styles across all authentication forms to ensure a cohesive accessible experience.

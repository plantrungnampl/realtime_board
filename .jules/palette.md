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

## 2024-10-25 - List Management Accessibility
**Learning:** In dynamic lists (like invitees), removing items via generic "x" buttons is a common accessibility trap. Screen readers lose context without specific labels.
**Action:** Use specific aria-labels (e.g., "Remove [item name]") for removal actions in lists, and prefer icon components over text characters for better visual scaling.

## 2024-10-27 - Keyboard Shortcuts Discovery
**Learning:** Keyboard shortcuts are powerful but useless if users don't know them. Displaying shortcuts in tooltips (e.g., "Rectangle (R)") bridges the gap between novice and power users without cluttering the UI.
**Action:** When implementing keyboard shortcuts for actions that have UI buttons, always update the button's tooltip or label to include the shortcut key.

## 2024-11-06 - Color Accessibility & Human-Readable Labels
**Learning:** Using hex codes in `aria-label` (e.g., "Fill #FFFFFF") is confusing for screen reader users. Mapping hex codes to human-readable names (e.g., "Fill White") significantly improves accessibility.
**Action:** Always map color values to localized, human-readable names in accessibility labels, even if the visual interface only shows the color.

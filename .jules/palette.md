## 2024-05-22 - Loading States in Forms
**Learning:** Adding immediate visual feedback (spinner) to form submission buttons significantly improves perceived performance and clarity, especially when backend latency is variable.
**Action:** Standardize `isLoading` prop on all actionable buttons (submit, delete, etc.) to ensure consistent feedback.

## 2024-05-23 - Form Accessibility & Interaction
**Learning:** Error messages without `role="alert"` are often missed by screen readers. Password fields without visibility toggles cause friction during registration.
**Action:** Always add `role="alert"` to form error containers and include accessible visibility toggles for password creation fields.

## 2025-01-25 - Icon-only buttons in dynamic lists
**Learning:** Icon-only buttons (like "x" for removal) in dynamic lists often lack accessible names and proper touch targets, making them difficult for screen reader users and touch users.
**Action:** When auditing lists, specifically check for "remove" or "delete" actions that use icons and ensure they have `aria-label` and `focus-visible` styles.

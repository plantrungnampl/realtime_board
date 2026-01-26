## 2024-05-24 - Standardizing Async Loading States
**Learning:** Inconsistent feedback during async operations creates a disjointed experience. Standardizing on a loading spinner inside the button provides consistent, immediate visual feedback across the application.
**Action:** Use the `isLoading` prop on the `Button` component for all async actions. This ensures a uniform disabled state and visual indicator (spinner) without manual text manipulation in every component.

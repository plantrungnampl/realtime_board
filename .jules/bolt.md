## 2026-01-24 - [Optimizing Canvas Grid Rendering]
**Learning:** Rendering thousands of individual `Line` components in `react-konva` for a grid is a performance bottleneck. The scene graph overhead (creation, reconciliation, hit testing) is significant.
**Action:** Use a single `Shape` component with a custom `sceneFunc` to draw the grid using immediate mode Canvas API calls. This reduces the node count to 1 and eliminates React reconciliation for individual lines.

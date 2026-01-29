# Bolt Journal

## 2024-05-23 - [Optimization] Board Element Rendering
**Learning:** Rendering hundreds of board elements inside a single `PixiScene` component causes unnecessary re-renders of all elements whenever the scene props (like pan position or drag state) change. By extracting individual element rendering into a memoized `BoardElementItem` component, we can leverage React's reconciliation to only update elements that actually change or when the scene structure changes. This significantly reduces the scripting time during high-frequency events like panning and dragging.

**Action:** When working with canvas-like lists in React (even with PixiJS), always extract the item renderer into a memoized component if the parent re-renders frequently.

## 2024-05-24 - [Optimization] Real-time Cursor Updates
**Learning:** High-frequency updates from real-time streams (like Yjs awareness) can trigger excessive React re-renders if the transformation function (e.g., `buildCursorMap`) creates new object references on every tick, even when data hasn't changed. By implementing granular equality checks and reusing previous state objects, we maintain referential stability, allowing React's memoization to effectively bail out of unnecessary updates.

**Action:** For high-frequency data transformations, always accept a `previous` state argument and reuse objects where possible to preserve referential equality.

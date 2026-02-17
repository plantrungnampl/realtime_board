# Bolt Journal

## 2024-05-23 - [Optimization] Board Element Rendering
**Learning:** Rendering hundreds of board elements inside a single `PixiScene` component causes unnecessary re-renders of all elements whenever the scene props (like pan position or drag state) change. By extracting individual element rendering into a memoized `BoardElementItem` component, we can leverage React's reconciliation to only update elements that actually change or when the scene structure changes. This significantly reduces the scripting time during high-frequency events like panning and dragging.

**Action:** When working with canvas-like lists in React (even with PixiJS), always extract the item renderer into a memoized component if the parent re-renders frequently.

## 2024-05-24 - [Optimization] Real-time Cursor Updates
**Learning:** High-frequency updates from real-time streams (like Yjs awareness) can trigger excessive React re-renders if the transformation function (e.g., `buildCursorMap`) creates new object references on every tick, even when data hasn't changed. By implementing granular equality checks and reusing previous state objects, we maintain referential stability, allowing React's memoization to effectively bail out of unnecessary updates.

**Action:** For high-frequency data transformations, always accept a `previous` state argument and reuse objects where possible to preserve referential equality.

## 2025-01-28 - [Optimization] Decoupling React State from Animation Loops
**Learning:** When animating PixiJS objects via `useTick` (or any requestAnimationFrame loop) inside a React component, passing the changing position as props (e.g., `x={pos.x}`) causes React to overwrite the interpolated position on every render, resulting in jittery motion. By initializing the position once (via state or ref) and letting the ticker handle all updates, we achieve smooth 60fps animation independent of React render cycles.

**Action:** For high-frequency animations in React/Pixi, use React props only for the *target* state, and manage the *current* visual state exclusively within the animation loop, avoiding prop bindings for the animated properties.

## 2025-02-04 - [Optimization] Stable Pixi Graphics Props
**Learning:** In `@pixi/react`, passing a new function to the `draw` prop of `<Graphics>` on every render forces the underlying Pixi object to clear and redraw, even if the visual output hasn't changed. By memoizing the `draw` callback with granular dependencies (e.g., style, width, height) instead of the volatile `element` object (which changes on every drag frame due to position updates), we prevent expensive redraws during dragging.

**Action:** When using `<Graphics>` in `@pixi/react`, always wrap the `draw` function in `useCallback` and ensure its dependencies are visually relevant properties, not the entire state object. Suppress `react-hooks/preserve-manual-memoization` if necessary.

## 2026-02-17 - [Optimization] Memoizing Expensive Calculations with Unstable Inputs
**Learning:** When an expensive utility function (like `resolveConnectorPoints`) depends on an object that changes reference frequently (like `element`), wrapping the call in `useMemo` with the object as a dependency fails to optimize. By constructing a minimal "proxy" object inside `useMemo` that only includes the strictly necessary properties (decomposed from the unstable source), we can ensure the calculation only re-runs when the relevant data actually changes.
**Action:** Use decomposed properties and proxy objects inside `useMemo` to stabilize expensive calculations dependent on volatile parent objects.

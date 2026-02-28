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

## 2025-02-13 - [Optimization] Avoiding Cascading Renders from `useEffect`
**Learning:** Using `useEffect` to trigger a state change synchronously after a render (e.g., `if (!canComment) setTool("select")`) forces React to throw away the just-completed render and start a new one, causing a cascading render that hurts performance. This is particularly problematic in complex components like `board.$boardId.tsx` where rendering is expensive. By calculating the derived state directly during render (or adjusting the state before rendering), we avoid this double-render penalty.

**Action:** Avoid calling `setState` inside `useEffect` if the state can be derived directly from props or other state during the initial render phase.

## 2025-02-13 - [Optimization] Stable Pixi Graphics Props II
**Learning:** In `@pixi/react`, passing inline `draw` functions and inline `style` objects (e.g. `{{ fontSize: 11, fill: cursor.color }}`) into components like `<pixiGraphics>` and `<pixiText>` on every render forces the underlying Pixi object to clear, recreate, and redraw objects/styles. In high-frequency components like cursors, this is extremely bad for performance. By using `useCallback` for draw functions and `useMemo` for inline styles based on primitive dependencies, we save significant processing time by keeping referential equality between renders.

**Action:** When using components in `@pixi/react`, always avoid passing inline functions for `draw` and inline objects for `style`. Wrap them in `useCallback` and `useMemo` respectively.

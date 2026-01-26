# Bolt Journal

## 2026-01-26 - Board Canvas Re-rendering Bottleneck
**Learning:** `BoardCanvasStage` renders all elements inline within a `map` loop. This causes every element to be re-evaluated on every render of the stage (e.g., cursor movement, pan/zoom), even if the element itself hasn't changed.
**Action:** Extract element rendering into a memoized component (`BoardElementItem`) so that only changed elements re-render.

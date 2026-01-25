# Bolt Journal

## 2024-05-23 - React-PIXI Optimization with Refs
**Learning:** Passing props derived from zoom level (like stroke width or hit-test callbacks) to children causes mass re-renders on zoom. Using Refs for stable callbacks and calculating derived values inside the child (or separate component) prevents this.
**Action:** When optimizing Canvas/PIXI apps, identify props that change on zoom/pan. Use Refs for callbacks (`useElementHitTest`) and split components so only the necessary parts (e.g., selection highlight) receive the changing props.

## 2026-03-23 - Prevented Unnecessary Re-Renders in TaskBoard List Items
**Learning:** React list rendering in the Kanban Board can get expensive when local state inputs (like "New Task Title" input fields) trigger re-renders on every keystroke. Using inline arrow functions for callbacks (like \`onClick={() => onClick(task.id)}\`) on list items causes them to fail shallow equality checks in `React.memo()`.
**Action:** Stabilized callback functions in list parent components using \`useCallback\`, updated child components to accept raw identifiers instead of wrapper functions for events, and wrapped the child list item components in \`React.memo()\` to effectively decouple them from the parent's generic state updates.

## 2025-01-27 - Stabilizing rapid React rerenders of markdown content
**Learning:** Rendering markdown (especially historical event threads) rapidly during typing or agent token streaming can cause severe CPU overhead and typing lag. `EventBubble` and `TimelineEvent` need memoization as they are expensive to render but rarely change props once completed.
**Action:** Use `React.memo` to wrap components that render heavy markdown content (like `EventBubble` and `TimelineEvent`) within lists that frequently receive new elements or state updates.

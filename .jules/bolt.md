## 2026-03-23 - Prevented Unnecessary Re-Renders in TaskBoard List Items
**Learning:** React list rendering in the Kanban Board can get expensive when local state inputs (like "New Task Title" input fields) trigger re-renders on every keystroke. Using inline arrow functions for callbacks (like \`onClick={() => onClick(task.id)}\`) on list items causes them to fail shallow equality checks in `React.memo()`.
**Action:** Stabilized callback functions in list parent components using \`useCallback\`, updated child components to accept raw identifiers instead of wrapper functions for events, and wrapped the child list item components in \`React.memo()\` to effectively decouple them from the parent's generic state updates.

## 2026-03-23 - Prevented O(N) Re-Renders in Agent Chat Thread
**Learning:** Streaming token responses in a chat interface triggers very frequent re-renders of the parent component. If child message components (`EventBubble`) and the callbacks passed to them aren't correctly memoized, every new token causes all preceding messages to re-render, leading to an O(N) performance degradation as the chat grows.
**Action:** Always wrap event/message bubbles in `React.memo()` and explicitly stabilize any parent-provided callback props using `useCallback()` (e.g. `handleApprovalDecision` in `AgentThread`) to maintain shallow equality.

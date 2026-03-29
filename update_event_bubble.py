import re

with open('src/panels/AgentThread/index.tsx', 'r') as f:
    content = f.read()

# Replace handleApprovalDecision with a useCallback version.
# Note: Since the state used inside handleApprovalDecision includes:
#   codexPort, activeSession, activeTaskId, sessions, pendingApprovalEventId, pendingApproval
# We'll use the simplest valid useCallback array:
#   [codexPort, activeSession, activeTaskId, sessions, pendingApprovalEventId, pendingApproval, setSessions]

# Actually, to truly stabilize the callback, since we're using Zustand store, we might not need all from dependency array
# But we must be careful with local useState (pendingApprovalEventId, pendingApproval)
# A better way is using useCallback with the necessary dependencies.
old_func = """  const handleApprovalDecision = async (requestId: string, decision: ApprovalDecision) => {
    if (!codexPort || !activeSession || !activeTaskId) return;
    const client = await getCodexClient(codexPort);
    client.respondToApproval(requestId, decision);
    await dbUpdateSession(activeSession.id, { status: "running" });
    setSessions(
      sessions.map((session) =>
        session.id === activeSession.id ? { ...session, status: "running" } : session
      )
    );
    useAgentsStore.getState().addEvent(activeSession.id, {
      id: `${Date.now()}-${Math.random()}`,
      session_id: activeSession.id,
      type: "approval_resolved",
      payload: { request_id: requestId, decision },
      received_at: new Date().toISOString(),
    });
    // Update the existing pending approval task event instead of creating a second one
    if (pendingApprovalEventId) {
      const resolved: ApprovalState =
        decision === "accept" ? "accepted" :
        decision === "acceptForSession" ? "alwaysApproved" : "declined";
      const metadata = JSON.stringify({ request_id: requestId, status: resolved, decision });
      await dbUpdateTaskEventMetadata(pendingApprovalEventId, metadata).catch(() => {});
      const { events } = useTasksStore.getState();
      const existing = (events[activeTaskId] ?? []).find((e) => e.id === pendingApprovalEventId);
      if (existing) updateEvent({ ...existing, metadata });
    }
    if (pendingApproval?.request_id === requestId) {
      setPendingApproval(null);
      setPendingApprovalEventId(null);
    }
  };"""

new_func = """  const handleApprovalDecision = useCallback(async (requestId: string, decision: ApprovalDecision) => {
    if (!codexPort || !activeSession || !activeTaskId) return;
    const client = await getCodexClient(codexPort);
    client.respondToApproval(requestId, decision);
    await dbUpdateSession(activeSession.id, { status: "running" });
    setSessions(
      sessions.map((session) =>
        session.id === activeSession.id ? { ...session, status: "running" } : session
      )
    );
    useAgentsStore.getState().addEvent(activeSession.id, {
      id: `${Date.now()}-${Math.random()}`,
      session_id: activeSession.id,
      type: "approval_resolved",
      payload: { request_id: requestId, decision },
      received_at: new Date().toISOString(),
    });
    // Update the existing pending approval task event instead of creating a second one
    if (pendingApprovalEventId) {
      const resolved: ApprovalState =
        decision === "accept" ? "accepted" :
        decision === "acceptForSession" ? "alwaysApproved" : "declined";
      const metadata = JSON.stringify({ request_id: requestId, status: resolved, decision });
      await dbUpdateTaskEventMetadata(pendingApprovalEventId, metadata).catch(() => {});
      const { events } = useTasksStore.getState();
      const existing = (events[activeTaskId] ?? []).find((e) => e.id === pendingApprovalEventId);
      if (existing) updateEvent({ ...existing, metadata });
    }
    if (pendingApproval?.request_id === requestId) {
      setPendingApproval(null);
      setPendingApprovalEventId(null);
    }
  }, [codexPort, activeSession, activeTaskId, sessions, pendingApprovalEventId, pendingApproval, setSessions, updateEvent]);"""

content = content.replace(old_func, new_func)

# Fix imports if useCallback is missing
if "useCallback" not in content[:content.find("\n", content.find("import { useEffect"))]:
    content = content.replace("import { useEffect, useRef, useState } from \"react\";", "import React, { useEffect, useRef, useState, useCallback } from \"react\";")

# Add React.memo to EventBubble
old_bubble = "function EventBubble({"
new_bubble = "const EventBubble = React.memo(function EventBubble({"

content = content.replace(old_bubble, new_bubble)

# Close the React.memo around the function
# The function ends with a closing brace `}` right before `\n` at EOF
content = re.sub(r'(\}\n*)$', r'})\n', content)

with open('src/panels/AgentThread/index.tsx', 'w') as f:
    f.write(content)

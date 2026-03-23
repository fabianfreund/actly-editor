/**
 * Codex App Server client.
 *
 * Protocol: JSON-RPC "lite" over WebSocket (no "jsonrpc" field).
 * Valid methods: initialize, thread/start, thread/resume, turn/start, turn/interrupt
 * Server notifications use { method, params } format.
 * Server approval requests use { id, method, params }.
 */

export type CodexEventType =
  | "thread.started"
  | "turn.started"
  | "turn.completed"
  | "turn.failed"
  | "mcp_startup_update"
  | "mcp_startup_complete"
  | "item.agent_message"
  | "item.reasoning"
  | "item.command_exec"
  | "item.file_change"
  | "item.mcp_tool_call"
  | "approval_request"
  | "error";

export interface CodexEvent {
  type: CodexEventType;
  thread_id?: string;
  item?: unknown;
  message?: string;
  [key: string]: unknown;
}

export interface ApprovalRequest extends CodexEvent {
  type: "approval_request";
  /** Stringified numeric JSON-RPC id — use for respondToApproval */
  request_id: string;
  description: string;
  method?: string;
  reason?: string | null;
  grant_root?: string | null;
  thread_id?: string;
  turn_id?: string;
  item_id?: string;
  command?: string[];
  file_paths?: string[];
}

export type ApprovalDecision = "accept" | "acceptForSession" | "decline" | "cancel";

type EventHandler = (event: CodexEvent) => void;

interface ThreadStartResult {
  thread?: {
    id?: string;
  };
}

interface TurnResult {
  turn?: {
    id?: string;
    status?: string;
    error?: {
      message?: string;
    } | null;
  };
  turnId?: string;
}

interface SendTurnOptions {
  cwd?: string;
  model?: string;
  approval_mode?: string;
  system_prompt?: string;
}

const REQUEST_TIMEOUT_MS = 10000;

export class CodexClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private messageId = 0;
  private pendingCallbacks: Map<number, (result: unknown, error?: unknown) => void> = new Map();
  private currentThreadId: string | null = null;
  private currentTurnId: string | null = null;
  readonly port: number;

  constructor(port: number) {
    this.port = port;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
      this.ws = ws;

      ws.onerror = (e) => reject(new Error(`Codex WS error: ${JSON.stringify(e)}`));

      ws.onclose = () => {
        this.currentThreadId = null;
        this.currentTurnId = null;
        this.dispatch({ type: "error", message: "Connection closed" });
      };

      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data as string) as Record<string, unknown>;
          this.handleMessage(data);
        } catch {
          // ignore unparseable messages
        }
      };

      ws.onopen = () => {
        // Required initialize handshake before sending any other messages
        const id = ++this.messageId;
        this.pendingCallbacks.set(id, (_result, error) => {
          if (error) {
            reject(new Error(`Codex initialize failed: ${JSON.stringify(error)}`));
            return;
          }
          ws.send(JSON.stringify({ method: "initialized" }));
          resolve();
        });
        ws.send(JSON.stringify({
          id,
          method: "initialize",
          params: {
            clientInfo: {
              name: "actly-editor",
              title: "Actly Editor",
              version: "0.1.0",
            },
            capabilities: {
              experimentalApi: true,
            },
          },
        }));
      };
    });
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }

  on(eventType: string, handler: EventHandler) {
    if (!this.handlers.has(eventType)) this.handlers.set(eventType, new Set());
    this.handlers.get(eventType)!.add(handler);
    return () => this.handlers.get(eventType)?.delete(handler);
  }

  private dispatch(event: CodexEvent) {
    this.handlers.get(event.type)?.forEach((h) => h(event));
    this.handlers.get("*")?.forEach((h) => h(event));
  }

  private handleMessage(data: Record<string, unknown>) {
    // Response to our request: { id, result } or { id, error }
    if ("id" in data && ("result" in data || "error" in data) && !("method" in data)) {
      const id = data.id as number;
      const cb = this.pendingCallbacks.get(id);
      if (cb) {
        this.pendingCallbacks.delete(id);
        cb(data.result, data.error);
      }
      return;
    }

    // Wrapped Codex event shape: { type: "codex/event/...", msg, conversationId }
    if (typeof data.type === "string" && data.type.startsWith("codex/event/")) {
      const rawType = data.type.slice("codex/event/".length);
      const msg = (data.msg ?? {}) as Record<string, unknown>;
      const conversationId = data.conversationId as string | undefined;

      if (rawType === "thread_started") {
        const thread = (msg.thread as Record<string, unknown> | undefined) ?? {};
        const threadId =
          (thread.id as string | undefined) ??
          (msg.thread_id as string | undefined) ??
          conversationId;
        if (threadId) this.currentThreadId = threadId;
        this.dispatch({
          type: "thread.started",
          thread_id: threadId,
          thread,
          conversationId,
          ...msg,
        });
        return;
      }

      if (rawType === "turn_started") {
        const turn = (msg.turn as Record<string, unknown> | undefined) ?? {};
        const turnId =
          (turn.id as string | undefined) ??
          (msg.turnId as string | undefined);
        if (turnId) this.currentTurnId = turnId;
        this.dispatch({
          type: "turn.started",
          turn_id: turnId,
          conversationId,
          ...msg,
        });
        return;
      }

      if (rawType === "turn_completed") {
        const turn = (msg.turn as Record<string, unknown> | undefined) ?? {};
        const turnId =
          (turn.id as string | undefined) ??
          (msg.turnId as string | undefined);
        if (this.currentTurnId === turnId) this.currentTurnId = null;
        const status =
          (turn.status as string | undefined) ??
          (msg.status as string | undefined);
        if (status === "failed") {
          this.dispatch({ type: "turn.failed", turn_id: turnId, conversationId, ...msg });
          return;
        }
        this.dispatch({ type: "turn.completed", turn_id: turnId, conversationId, ...msg });
        return;
      }

      if (rawType === "mcp_startup_update" || rawType === "mcp_startup_complete") {
        this.dispatch({
          type: rawType as CodexEventType,
          conversationId,
          ...msg,
        });
        return;
      }
    }

    // Server-initiated request (approval): { id, method, params }
    if ("id" in data && "method" in data) {
      const method = data.method as string;
      const params = (data.params ?? {}) as Record<string, unknown>;
      const numericId = data.id as number;

      if (
        method === "approval/request" ||
        method === "item/commandExecution/requestApproval" ||
        method === "item/fileChange/requestApproval"
      ) {
        const event = this.buildApprovalRequest(String(numericId), method, params);
        this.dispatch(event);
      }
      return;
    }

    // Server notification: { method, params } (no id)
    if ("method" in data) {
      const method = data.method as string;
      const params = (data.params ?? {}) as Record<string, unknown>;
      this.normalizeAndDispatch(method, params);
      return;
    }

    // Legacy flat event shape (fallback)
    if ("type" in data) {
      if (data.type === "thread.started") {
        const thread = (data.thread as Record<string, unknown> | undefined) ?? {};
        const threadId =
          (data.thread_id as string | undefined) ??
          (thread.id as string | undefined);
        if (threadId) this.currentThreadId = threadId;
      }
      if (data.type === "turn.started") {
        const turn = (data.turn as Record<string, unknown> | undefined) ?? {};
        const turnId =
          (data.turn_id as string | undefined) ??
          (turn.id as string | undefined);
        if (turnId) this.currentTurnId = turnId;
      }
      if (data.type === "turn.completed" || data.type === "turn.failed") {
        this.currentTurnId = null;
      }
      this.dispatch(data as unknown as CodexEvent);
    }
  }

  private normalizeAndDispatch(method: string, params: Record<string, unknown>) {
    if (method === "thread/started") {
      const thread = (params.thread as Record<string, unknown> | undefined) ?? {};
      const threadId =
        (thread.id as string | undefined) ??
        (params.thread_id as string | undefined);
      if (threadId) this.currentThreadId = threadId;
      this.dispatch({ type: "thread.started", thread_id: threadId, ...params });
      return;
    }

    if (method === "turn/started") {
      const turn = (params.turn as Record<string, unknown> | undefined) ?? {};
      const turnId =
        (turn.id as string | undefined) ??
        (params.turnId as string | undefined);
      if (turnId) this.currentTurnId = turnId;
      this.dispatch({ type: "turn.started", turn_id: turnId, ...params });
      return;
    }

    // turn/completed with failure status → turn.failed
    if (method === "turn/completed" && params.status === "failed") {
      this.currentTurnId = null;
      this.dispatch({ type: "turn.failed", ...params });
      return;
    }
    if (method === "turn/completed") {
      this.currentTurnId = null;
      this.dispatch({ type: "turn.completed", ...params });
      return;
    }

    if (method === "error") {
      const error = (params.error as Record<string, unknown> | undefined) ?? {};
      const message =
        (error.message as string | undefined) ??
        (params.message as string | undefined) ??
        "Codex error";
      this.dispatch({ type: "error", message, error, ...params });
      return;
    }

    const METHOD_MAP: Record<string, CodexEventType> = {
    };

    const mappedType = METHOD_MAP[method];
    if (mappedType) {
      this.dispatch({ type: mappedType, ...params });
      return;
    }

    if (method === "item/agentMessage/delta" || method === "item/agentMessage") {
      const content =
        (params.delta as string | undefined) ??
        (params.content as string | undefined) ??
        "";
      this.dispatch({ type: "item.agent_message", item: { content }, ...params });
      return;
    }

    if (
      method === "item/commandExec" ||
      method === "item/command_exec" ||
      method === "item/commandExecution/outputDelta" ||
      method === "item/commandExecution"
    ) {
      this.dispatch({ type: "item.command_exec", item: params, ...params });
      return;
    }

    if (
      method === "item/fileChange" ||
      method === "item/fileChange/outputDelta" ||
      method === "patch/applied"
    ) {
      this.dispatch({ type: "item.file_change", item: params, ...params });
      return;
    }

    if (method === "item/reasoning") {
      this.dispatch({ type: "item.reasoning", item: params, ...params });
      return;
    }

    // Pass through unknown notifications via wildcard handler
    this.dispatch({ type: method as CodexEventType, ...params });
  }

  private buildApprovalRequest(
    requestId: string,
    method: string,
    params: Record<string, unknown>
  ): ApprovalRequest {
    const parsedDescription = this.parseApprovalMetadata(params.description);
    const parsedExplanation = this.parseApprovalMetadata(params.explanation);

    const threadId =
      (params.threadId as string | undefined) ??
      (params.thread_id as string | undefined) ??
      parsedDescription.threadId ??
      parsedExplanation.threadId;
    const turnId =
      (params.turnId as string | undefined) ??
      (params.turn_id as string | undefined) ??
      parsedDescription.turnId ??
      parsedExplanation.turnId;
    const itemId =
      (params.itemId as string | undefined) ??
      (params.item_id as string | undefined) ??
      parsedDescription.itemId ??
      parsedExplanation.itemId;
    const reason =
      (params.reason as string | null | undefined) ??
      parsedDescription.reason ??
      parsedExplanation.reason ??
      null;
    const grantRoot =
      (params.grantRoot as string | null | undefined) ??
      (params.grant_root as string | null | undefined) ??
      parsedDescription.grantRoot ??
      parsedExplanation.grantRoot ??
      null;

    const command = this.extractCommand(params, parsedDescription.value, parsedExplanation.value);
    const filePaths = this.extractFilePaths(params, parsedDescription.value, parsedExplanation.value);
    const description =
      this.extractHumanDescription(params, parsedDescription.value, parsedExplanation.value) ??
      "";

    return {
      type: "approval_request",
      request_id: requestId,
      method,
      description,
      reason,
      grant_root: grantRoot,
      thread_id: threadId,
      turn_id: turnId,
      item_id: itemId,
      command,
      file_paths: filePaths,
      ...params,
    };
  }

  private parseApprovalMetadata(value: unknown): {
    value?: Record<string, unknown>;
    threadId?: string;
    turnId?: string;
    itemId?: string;
    reason?: string | null;
    grantRoot?: string | null;
  } {
    if (typeof value !== "string") return {};
    try {
      const parsed = JSON.parse(value) as Record<string, unknown>;
      return {
        value: parsed,
        threadId:
          (parsed.threadId as string | undefined) ??
          (parsed.thread_id as string | undefined),
        turnId:
          (parsed.turnId as string | undefined) ??
          (parsed.turn_id as string | undefined),
        itemId:
          (parsed.itemId as string | undefined) ??
          (parsed.item_id as string | undefined),
        reason: (parsed.reason as string | null | undefined) ?? null,
        grantRoot:
          (parsed.grantRoot as string | null | undefined) ??
          (parsed.grant_root as string | null | undefined) ??
          null,
      };
    } catch {
      return {};
    }
  }

  private extractCommand(
    params: Record<string, unknown>,
    ...candidates: Array<Record<string, unknown> | undefined>
  ): string[] | undefined {
    const values: unknown[] = [
      params.command,
      params.commands,
      ...candidates.flatMap((candidate) =>
        candidate ? [candidate.command, candidate.commands, candidate.argv] : []
      ),
    ];

    for (const value of values) {
      if (Array.isArray(value)) {
        const parts = value.filter((part): part is string => typeof part === "string" && part.trim().length > 0);
        if (parts.length > 0) return parts;
      }
      if (typeof value === "string" && value.trim()) {
        return [value.trim()];
      }
    }

    return undefined;
  }

  private extractFilePaths(
    params: Record<string, unknown>,
    ...candidates: Array<Record<string, unknown> | undefined>
  ): string[] | undefined {
    const values: unknown[] = [
      params.paths,
      params.filePaths,
      params.files,
      ...candidates.flatMap((candidate) =>
        candidate ? [candidate.paths, candidate.filePaths, candidate.files] : []
      ),
    ];

    for (const value of values) {
      if (Array.isArray(value)) {
        const paths = value.filter((part): part is string => typeof part === "string" && part.trim().length > 0);
        if (paths.length > 0) return paths;
      }
      if (typeof value === "string" && value.trim()) {
        return [value.trim()];
      }
    }

    return undefined;
  }

  private extractHumanDescription(
    params: Record<string, unknown>,
    ...candidates: Array<Record<string, unknown> | undefined>
  ): string | undefined {
    const directStrings = [
      params.description,
      params.explanation,
      ...candidates.flatMap((candidate) =>
        candidate ? [candidate.description, candidate.explanation, candidate.message] : []
      ),
    ];

    for (const value of directStrings) {
      if (typeof value !== "string") continue;
      const trimmed = value.trim();
      if (!trimmed || trimmed === "{}") continue;
      try {
        JSON.parse(trimmed);
        continue;
      } catch {
        return trimmed;
      }
    }

    return undefined;
  }

  private request<T>(method: string, params: unknown = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      const timeout = window.setTimeout(() => {
        this.pendingCallbacks.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, REQUEST_TIMEOUT_MS);

      this.pendingCallbacks.set(id, (result, error) => {
        window.clearTimeout(timeout);
        if (error) {
          const rpcError = error as { code?: number; message?: string } | string;
          reject(new Error(
            typeof rpcError === "string"
              ? rpcError
              : rpcError.message ?? JSON.stringify(rpcError)
          ));
          return;
        }
        resolve(result as T);
      });
      this.ws?.send(JSON.stringify({ id, method, params }));
    });
  }

  private mapApprovalMode(approvalMode?: string): string | undefined {
    const approvalPolicyMap: Record<string, string> = {
      auto: "on-request",
      full: "always",
      readonly: "always",
      never: "never",
    };
    return approvalPolicyMap[approvalMode ?? "auto"] ?? "on-request";
  }

  private buildTurnOverrides(params: SendTurnOptions = {}): Record<string, unknown> {
    const turnParams: Record<string, unknown> = {};
    const approvalPolicy = this.mapApprovalMode(params.approval_mode);

    if (params.cwd) turnParams.cwd = params.cwd;
    if (params.model) turnParams.model = params.model;
    if (approvalPolicy) turnParams.approvalPolicy = approvalPolicy;
    if (params.system_prompt) {
      turnParams.collaborationMode = {
        mode: "developer",
        settings: {
          developer_instructions: params.system_prompt,
        },
      };
    }

    return turnParams;
  }

  /** Start a new agent thread. */
  async createThread(params: {
    workdir: string;
    model?: string;
    approval_mode?: string;
  }): Promise<string> {
    const approvalPolicy = this.mapApprovalMode(params.approval_mode);

    const threadParams: Record<string, unknown> = {
      cwd: params.workdir,
      serviceName: "actly-editor",
      ephemeral: true,
    };
    if (approvalPolicy) threadParams.approvalPolicy = approvalPolicy;
    if (params.model) threadParams.model = params.model;

    const result = await this.request<ThreadStartResult>("thread/start", threadParams);
    const threadId = result.thread?.id;
    if (!threadId) {
      throw new Error("Codex did not return a thread ID from thread/start");
    }
    this.currentThreadId = threadId;
    return threadId;
  }

  async resumeThread(threadId: string): Promise<string> {
    const result = await this.request<ThreadStartResult>("thread/resume", { threadId });
    const resolvedThreadId = result.thread?.id ?? threadId;
    this.currentThreadId = resolvedThreadId;
    return resolvedThreadId;
  }

  /** Send a user message into the currently active thread. */
  async sendMessage(content: string, options: SendTurnOptions = {}): Promise<string | null> {
    if (!this.currentThreadId) {
      throw new Error("Cannot start a turn before a Codex thread is active");
    }
    const result = await this.request<TurnResult>("turn/start", {
      threadId: this.currentThreadId,
      input: [{ type: "text", text: content }],
      ...this.buildTurnOverrides(options),
    });
    const turnId = result.turn?.id ?? result.turnId ?? null;
    if (turnId) this.currentTurnId = turnId;
    return turnId;
  }

  /** Respond to an approval request. requestId must be the stringified numeric JSON-RPC id. */
  respondToApproval(requestId: string, decision: ApprovalDecision): number {
    const numericId = Number(requestId);
    this.ws?.send(JSON.stringify({
      id: numericId,
      result: { decision },
    }));
    return numericId;
  }

  /** Cancel the current turn. */
  interruptTurn(): Promise<void> {
    if (!this.currentThreadId || !this.currentTurnId) {
      return Promise.reject(new Error("Cannot interrupt without an active thread and turn"));
    }
    return this.request("turn/interrupt", {
      threadId: this.currentThreadId,
      turnId: this.currentTurnId,
    });
  }
}

// ─── Singleton per port ───────────────────────────────────────────────────────

const clients: Map<number, CodexClient> = new Map();

export async function getCodexClient(port: number): Promise<CodexClient> {
  if (!clients.has(port)) {
    const client = new CodexClient(port);
    await client.connect();
    clients.set(port, client);
  }
  return clients.get(port)!;
}

export function disconnectCodexClient(port: number) {
  clients.get(port)?.disconnect();
  clients.delete(port);
}

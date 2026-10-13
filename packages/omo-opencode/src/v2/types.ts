// Hand-mirrored subset of the OpenCode V2 plugin API (@opencode/plugin).
// Deliberately has NO runtime import of "@opencode/plugin": the V1 host must
// be able to load the main bundle without the V2 package installed, and the
// V2 host injects the real context at load time. Structural typing only —
// every domain used here is optional at runtime and capability-probed before
// use. Drift against the official surface is caught at compile time by
// mirror-conformance.ts (which must stay non-*.test.ts so tsconfig includes it).

export type V2Registration = {
  readonly dispose: () => Promise<void>
}

export type V2PluginOptions = Record<string, unknown>

export type V2AgentPermission = {
  action: string
  resource: string
  effect: "allow" | "deny" | "ask"
}

// DeepMutable<V2 Agent.Info> shape as consumed by the bridge. Fields the
// bridge never touches are omitted; update callbacks receive the full object.
export type V2AgentInfo = {
  id?: string
  name?: string
  description?: string
  mode?: "subagent" | "primary" | "all"
  system?: string
  model?: { id: string; providerID: string; variant?: string }
  request?: {
    settings?: Record<string, unknown>
    headers?: Record<string, string>
    body?: Record<string, unknown>
  }
  temperature?: number
  color?: string
  steps?: number
  hidden?: boolean
  permissions?: V2AgentPermission[]
  tools?: unknown
  [key: string]: unknown
}

export type V2AgentEditor = {
  list: () => readonly V2AgentInfo[]
  get: (id: string) => V2AgentInfo | undefined
  default: (id: string | undefined) => void
  update: (id: string, update: (agent: V2AgentInfo) => void) => void
  remove: (id: string) => void
}

export type V2TextPart = {
  type: "text"
  text: string
  cache?: unknown
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export type V2SystemPart = {
  type: "text"
  text: string
  cache?: unknown
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

export type V2Message = {
  role?: string
  content?: ReadonlyArray<Record<string, unknown>>
  info?: Record<string, unknown>
  [key: string]: unknown
}

export type V2PromptAttachment = {
  uri?: string
  name?: string
  id?: string
  [key: string]: unknown
}

export type V2SessionPromptEvent = {
  readonly sessionID: string
  readonly messageID: string
  prompt: {
    text?: string
    files?: V2PromptAttachment[]
    agents?: V2PromptAttachment[]
    skills?: V2PromptAttachment[]
  }
  metadata?: Record<string, unknown>
  delivery: "steer" | "queue"
}

export type V2ModelRef = {
  id: string
  providerID: string
  variant?: string
}

export type V2SessionContextEvent = {
  readonly sessionID: string
  readonly agent: string
  readonly model: V2ModelRef
  system: V2SystemPart[]
  messages: V2Message[]
  tools: Record<string, { description: string; input: unknown }>
  options: Record<string, unknown>
}

export type V2SessionCompactionEvent = V2SessionContextEvent & {
  result?: {
    summary: string
    providerState?: unknown
    metadata?: Record<string, unknown>
    tokens?: unknown
  }
}

export type V2SessionModelRequestEvent = {
  readonly sessionID: string
  readonly agent: string
  readonly model: V2ModelRef
  readonly kind: "primary" | "compaction" | "title" | "generate"
  baseURL?: string
  headers: Record<string, string>
}

export type V2SessionHookName =
  | "prompt"
  | "context"
  | "compaction"
  | "generate"
  | "title"
  | "model.request"
  | "http.request"
  | "http.response"
  | "retry"

export type V2ToolHookEvent = {
  tool: string
  readonly sessionID: string
  readonly agent: string
  readonly messageID: string
  readonly id: string
  input: unknown
  [key: string]: unknown
}

export type V2ToolAfterEvent = V2ToolHookEvent & {
  readonly status: "completed" | "error"
  result?: { content?: unknown; [key: string]: unknown }
  error?: { message?: string; [key: string]: unknown } | string
}

export type V2ToolDefinition = {
  name: string
  description: string
  input: Record<string, unknown>
  options?: { namespace?: string; codemode?: boolean; [key: string]: unknown }
  execute: (input: never, context: V2ToolExecuteContext) => Promise<V2ToolResult>
}

export type V2ToolResult = {
  content?: unknown
  metadata?: Record<string, unknown>
  title?: string
  [key: string]: unknown
}

export type V2ToolExecuteContext = {
  readonly sessionID: string
  readonly agent: string
  readonly messageID: string
  readonly directory: string
  readonly worktree: string
  readonly signal: AbortSignal
  progress: (update: Record<string, unknown>) => Promise<void>
  [key: string]: unknown
}

export type V2ToolEditor = {
  list: () => ReadonlyArray<V2ToolDefinition & { readonly id: string }>
  get: (id: string) => (V2ToolDefinition & { readonly id: string }) | undefined
  namespace: (namespace: { name: string; description: string }) => void
  add: (tool: V2ToolDefinition) => void
  update: (id: string, update: (tool: V2ToolDefinition) => void) => void
  remove: (id: string) => void
}

export type V2CommandInvocation = {
  readonly sessionID: string
  prompt: Record<string, unknown>
  delivery: "steer" | "queue"
}

export type V2CommandEditor = {
  add: (definition: {
    name: string
    description?: string
    execute: (input: V2CommandInvocation) => Promise<void>
  }) => void
}

export type V2McpServerConfig =
  | {
      type: "remote"
      url: string
      headers?: Record<string, string>
      oauth?: false | Record<string, unknown>
      disabled?: boolean
      [key: string]: unknown
    }
  | {
      type: "local"
      command: string[]
      cwd?: string
      environment?: Record<string, string>
      disabled?: boolean
      [key: string]: unknown
    }

export type V2McpEditor = {
  list: () => readonly (readonly [string, V2McpServerConfig])[]
  get: (name: string) => V2McpServerConfig | undefined
  set: (name: string, config: V2McpServerConfig) => void
  update: (name: string, update: (config: V2McpServerConfig) => void) => void
  remove: (name: string) => void
}

export type V2SkillInfo = {
  id: string
  name: string
  description: string
  path?: string
  content?: string
  [key: string]: unknown
}

export type V2SkillEditor = {
  list: () => readonly V2SkillInfo[]
  get: (id: string) => V2SkillInfo | undefined
  add: (skill: V2SkillInfo) => void
  update: (id: string, update: (skill: V2SkillInfo) => void) => void
  remove: (id: string) => void
}

export type V2Event = {
  type: string
  id?: string
  created?: number
  data?: Record<string, unknown>
  properties?: Record<string, unknown>
  location?: { directory?: string; [key: string]: unknown }
  [key: string]: unknown
}

export type V2Context = {
  readonly app: { version: string; [key: string]: unknown }
  readonly location: {
    directory: string
    project: { id: string; [key: string]: unknown }
    [key: string]: unknown
  }
  readonly options: V2PluginOptions
  readonly agent: {
    transform: (callback: (editor: V2AgentEditor) => void) => Promise<V2Registration>
    reload?: () => Promise<void>
    [key: string]: unknown
  }
  readonly command: {
    transform: (callback: (editor: V2CommandEditor) => void) => Promise<V2Registration>
    reload?: () => Promise<void>
    [key: string]: unknown
  }
  readonly event: {
    subscribe: (options?: { signal?: AbortSignal }) => AsyncIterable<V2Event>
  }
  readonly mcp?: {
    transform: (callback: (editor: V2McpEditor) => void) => Promise<V2Registration>
    reload?: () => Promise<void>
    [key: string]: unknown
  }
  readonly skill?: {
    transform: (callback: (editor: V2SkillEditor) => void) => Promise<V2Registration>
    reload?: () => Promise<void>
    [key: string]: unknown
  }
  readonly storage?: {
    get: (key: string) => Promise<unknown>
    set: (key: string, value: unknown) => Promise<void>
    remove: (key: string) => Promise<void>
    [key: string]: unknown
  }
  readonly session: {
    hook: (
      name: V2SessionHookName,
      callback: (event: never) => unknown,
      options?: { providerID?: string },
    ) => Promise<V2Registration>
    prompt?: (input: Record<string, unknown>) => Promise<unknown>
    get?: (input: Record<string, unknown>) => Promise<unknown>
    update?: (input: Record<string, unknown>) => Promise<unknown>
    switchModel?: (input: Record<string, unknown>) => Promise<unknown>
    interrupt?: (input: Record<string, unknown>) => Promise<unknown>
    [key: string]: unknown
  }
  readonly tool: {
    transform: (callback: (editor: V2ToolEditor) => void) => Promise<V2Registration>
    reload?: () => Promise<void>
    hook: (
      name: "execute.before" | "execute.after",
      callback: (event: never) => unknown,
    ) => Promise<V2Registration>
    [key: string]: unknown
  }
  readonly generate?: {
    text?: (input: Record<string, unknown>) => Promise<unknown>
    [key: string]: unknown
  }
  readonly permission?: {
    reply?: (input: Record<string, unknown>) => Promise<unknown>
    [key: string]: unknown
  }
  [key: string]: unknown
}

export type V2Cleanup = () => Promise<void> | void

export type V2Setup = (ctx: V2Context) => Promise<V2Cleanup | void> | V2Cleanup | void

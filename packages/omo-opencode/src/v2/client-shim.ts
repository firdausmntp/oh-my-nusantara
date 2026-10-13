// Builds a V1-shaped PluginInput from a V2 plugin context so the existing
// V1 factory (createPluginModule().server) can run unmodified on V2 hosts.
// The client is a shim delegating V1 SDK call shapes to V2 flat session
// calls. Methods with no V2 equivalent are OMITTED (never stubbed) so
// capability probes (`typeof x === "function"`) see the truth; direct
// callers hit a clear V2BridgeError caught by their own try/catch.
import { log } from "../shared/logger"
import type { V2Context, V2Event } from "./types"

export class V2BridgeError extends Error {
  constructor(method: string) {
    super(`[v2-bridge] ${method} has no equivalent on this OpenCode V2 host`)
    this.name = "V2BridgeError"
  }
}

type LooseArgs = {
  path?: { id?: string; messageID?: string }
  query?: Record<string, unknown>
  body?: Record<string, unknown> & {
    text?: string
    agent?: string
    model?: string
    variant?: string
    delivery?: string
    noReply?: boolean
    files?: unknown[]
    metadata?: Record<string, unknown>
    title?: string
  }
  [key: string]: unknown
}

function sessionIDOf(args: LooseArgs): string {
  const id = args.path?.id
  if (typeof id === "string" && id.length > 0) return id
  throw new V2BridgeError("session.<anonymous> (missing path.id)")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

// V2 session.context returns message infos; V1 consumers expect
// [{ info, parts }]. Pass through entries that already match, wrap the rest.
function toV1Messages(data: unknown): Array<{ info: unknown; parts: unknown[] }> {
  if (!Array.isArray(data)) return []
  return data.map((entry) => {
    if (isRecord(entry) && "info" in entry && "parts" in entry) {
      return {
        info: entry.info,
        parts: Array.isArray(entry.parts) ? (entry.parts as unknown[]) : [],
      }
    }
    if (isRecord(entry) && typeof entry.role === "string") {
      const { role, content, ...rest } = entry as { role: string; content?: unknown } & Record<string, unknown>
      const parts = Array.isArray(content) ? content : []
      return { info: { role, ...rest }, parts }
    }
    return { info: entry, parts: [] }
  })
}

export type V1ShimInput = {
  directory: string
  project: { id: string; directory: string }
  worktree: string
  client: Record<string, Record<string, (...args: never[]) => Promise<unknown>>>
  experimental_workspace: { register: (...args: never[]) => void }
  serverUrl: undefined
  $: undefined
  hostFlavor: "v2"
  [key: string]: unknown
}

export function payloadOf(event: V2Event): Record<string, unknown> {
  if (isRecord(event.data)) return event.data
  if (isRecord(event.properties)) return event.properties
  return {}
}

export function buildV1Input(ctx: V2Context): V1ShimInput {
  const directory =
    typeof ctx.location?.directory === "string" && ctx.location.directory.length > 0
      ? ctx.location.directory
      : process.cwd()
  const projectID =
    typeof ctx.location?.project?.id === "string" && ctx.location.project.id.length > 0
      ? ctx.location.project.id
      : "global"

  const session = ctx.session
  const sessionShim: Record<string, (...args: never[]) => Promise<unknown>> = {}

  if (typeof session?.get === "function") {
    const get = session.get.bind(session)
    sessionShim.get = (async (args: LooseArgs) => {
      const data = await get({ sessionID: sessionIDOf(args) })
      return { data }
    }) as (...args: never[]) => Promise<unknown>
  }

  if (typeof session?.create === "function") {
    const create = session.create.bind(session)
    sessionShim.create = (async (args: LooseArgs) => {
      const data = await create({ ...(args.body ?? {}), ...(args.query ?? {}) })
      return { data }
    }) as (...args: never[]) => Promise<unknown>
  }

  // session.messages: served via session.context (terminal metadata preserved
  // best-effort; V1 roles map 1:1 for user/assistant, system stays system).
  if (typeof session?.context === "function") {
    const context = session.context.bind(session)
    sessionShim.messages = (async (args: LooseArgs) => {
      const limit = typeof args.query?.limit === "number" ? args.query.limit : undefined
      const data = await context(
        limit === undefined ? { sessionID: sessionIDOf(args) } : { sessionID: sessionIDOf(args), limit },
      )
      return { data: toV1Messages(data) }
    }) as (...args: never[]) => Promise<unknown>
  }

  // session.message (single fetch for the chat.headers internal-marker check):
  // served by scanning session.context for the message id.
  if (typeof session?.context === "function") {
    const context = session.context.bind(session)
    sessionShim.message = (async (args: LooseArgs) => {
      const messageID = args.path?.messageID
      const data = await context({ sessionID: sessionIDOf(args) })
      const messages = toV1Messages(data)
      const found = messages.find((entry) => {
        if (!isRecord(entry.info)) return false
        const info = entry.info as { id?: unknown; messageID?: unknown }
        return info.id === messageID || info.messageID === messageID
      })
      return { data: found ?? { info: {}, parts: [] } }
    }) as (...args: never[]) => Promise<unknown>
  }

  if (typeof session?.prompt === "function") {
    const prompt = session.prompt.bind(session)
    sessionShim.prompt = (async (args: LooseArgs) => {
      const body = args.body ?? {}
      if (body.agent !== undefined || body.model !== undefined || body.variant !== undefined) {
        throw new V2BridgeError("session.prompt with agent/model/variant override")
      }
      const data = await prompt({
        sessionID: sessionIDOf(args),
        text: typeof body.text === "string" ? body.text : "",
        delivery: body.delivery === "queue" ? "queue" : "steer",
        ...(body.files !== undefined ? { files: body.files } : {}),
        ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
      })
      return { data }
    }) as (...args: never[]) => Promise<unknown>
  }

  // session.promptAsync: prompt then wait for idle when the host offers wait.
  // Returns the prompt ack; completion waiting is best-effort.
  if (typeof session?.prompt === "function") {
    const prompt = session.prompt.bind(session)
    const wait = typeof session?.wait === "function" ? session.wait.bind(session) : undefined
    sessionShim.promptAsync = (async (args: LooseArgs) => {
      const body = args.body ?? {}
      const sessionID = sessionIDOf(args)
      const ack = (await prompt({
        sessionID,
        text: typeof body.text === "string" ? body.text : "",
        delivery: body.delivery === "queue" ? "queue" : "steer",
        ...(body.files !== undefined ? { files: body.files } : {}),
        ...(body.metadata !== undefined ? { metadata: body.metadata } : {}),
      })) as unknown
      if (body.noReply !== true && wait) {
        try {
          await wait({ sessionID })
        } catch (error) {
          log("[v2-bridge] session.promptAsync wait failed", {
            sessionID,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }
      return { data: ack }
    }) as (...args: never[]) => Promise<unknown>
  }

  if (typeof session?.update === "function") {
    const update = session.update.bind(session)
    sessionShim.update = (async (args: LooseArgs) => {
      const body = args.body ?? {}
      const data = await update({ sessionID: sessionIDOf(args), ...body })
      return { data }
    }) as (...args: never[]) => Promise<unknown>
  }

  if (typeof session?.remove === "function") {
    const remove = session.remove.bind(session)
    // V1 calls session.delete({ path: { id } }); expose both spellings.
    const removeById = (async (args: LooseArgs) => {
      const data = await remove({ sessionID: sessionIDOf(args) })
      return { data }
    }) as (...args: never[]) => Promise<unknown>
    sessionShim.remove = removeById
    sessionShim.delete = removeById
  }

  if (typeof session?.interrupt === "function") {
    const interrupt = session.interrupt.bind(session)
    // V1 session.abort({ path: { id } }) -> V2 interrupt without resume.
    sessionShim.abort = (async (args: LooseArgs) => {
      const data = await interrupt({ sessionID: sessionIDOf(args), resume: false })
      return { data }
    }) as (...args: never[]) => Promise<unknown>
  }

  // Deliberately omitted (no V2 equivalent — probes must see absence):
  // status (no live status map), list, children, todo.

  const appShim: Record<string, (...args: never[]) => Promise<unknown>> = {
    log: (async (args: LooseArgs) => {
      const body = args.body ?? {}
      const level = typeof body.level === "string" ? body.level : "info"
      const message = typeof body.message === "string" ? body.message : JSON.stringify(body)
      const service = typeof body.service === "string" ? `[${body.service}] ` : ""
      log(`[v2-bridge:app] ${service}${message}`, { level })
      return { data: null }
    }) as (...args: never[]) => Promise<unknown>,
  }

  const tuiShim: Record<string, (...args: never[]) => Promise<unknown>> = {
    showToast: (async (args: LooseArgs) => {
      const body = args.body ?? {}
      log("[v2-bridge:toast]", {
        title: body.title,
        message: body.message,
        variant: body.variant,
      })
      return { data: null }
    }) as (...args: never[]) => Promise<unknown>,
  }

  const clientShim: V1ShimInput["client"] = {
    session: sessionShim,
    app: appShim,
    tui: tuiShim,
  }

  if (ctx.permission && typeof ctx.permission.reply === "function") {
    const reply = ctx.permission.reply.bind(ctx.permission)
    clientShim.permission = {
      reply: (async (args: LooseArgs) => {
        const data = await reply({ ...(args.body ?? {}), ...(args.path ?? {}) })
        return { data }
      }) as (...args: never[]) => Promise<unknown>,
    }
  }

  return {
    directory,
    project: { id: projectID, directory },
    worktree: directory,
    client: clientShim,
    experimental_workspace: { register: () => {} },
    serverUrl: undefined,
    $: undefined,
    hostFlavor: "v2",
  }
}

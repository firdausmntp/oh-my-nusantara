// Maps V2 server events onto the V1 event shapes consumed by
// plugin/event.ts (which reads event.properties.*). Additive synthesis only:
// the raw event is always dispatched first, then synthesized V1 shapes.
// All synthesized events write `properties` (the key V1 consumers read);
// payloads are read data-first (`data`, with `properties` fallback) because
// live V2 hosts frame payloads under `data`.
import { payloadOf } from "./client-shim"
import type { V2Event } from "./types"

export type V1Event = {
  type: string
  properties: Record<string, unknown>
}

function v1(type: string, properties: Record<string, unknown> = {}): V1Event {
  return { type, properties }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value === "object" && value !== null) return value as Record<string, unknown>
  return undefined
}

function sessionIDFrom(payload: Record<string, unknown>): string | undefined {
  const direct = payload.sessionID
  if (typeof direct === "string") return direct
  const info = asRecord(payload.info)
  if (info && typeof info.id === "string") return info.id
  const session = asRecord(payload.session)
  if (session && typeof session.id === "string") return session.id
  return undefined
}

function usageToMessageUpdated(
  sessionID: string,
  payload: Record<string, unknown>,
  fallbackID: string | undefined,
): V1Event | undefined {
  const input = payload.input
  const output = payload.output
  if (typeof input !== "number" || typeof output !== "number") return undefined
  const cacheRead = typeof payload.cacheRead === "number" ? payload.cacheRead : 0
  const cacheWrite = typeof payload.cacheWrite === "number" ? payload.cacheWrite : 0
  const completed =
    typeof payload.completed === "number"
      ? payload.completed
      : typeof payload.time === "number"
        ? payload.time
        : Date.now()
  return v1("message.updated", {
    sessionID,
    info: {
      id: `v2-usage:${sessionID}:${input}:${output}:${cacheRead}:${cacheWrite}`,
      sessionID,
      role: "assistant",
      time: { completed },
    },
    messageID: fallbackID,
  })
}

function formToQuestion(
  type: "form.created" | "form.replied" | "form.cancelled",
  payload: Record<string, unknown>,
): V1Event | undefined {
  const sessionID = sessionIDFrom(payload)
  if (sessionID === undefined || sessionID === "global") return undefined
  const formID =
    typeof payload.id === "string"
      ? payload.id
      : typeof payload.formID === "string"
        ? payload.formID
        : undefined
  if (formID === undefined) return undefined
  if (type === "form.created") {
    const questions = Array.isArray(payload.questions) ? payload.questions : []
    const first = asRecord(questions[0]) ?? {}
    const header =
      typeof first.header === "string"
        ? first.header.slice(0, 30)
        : typeof payload.title === "string"
          ? payload.title.slice(0, 30)
          : "input"
    return v1("question.asked", {
      sessionID,
      requestID: formID,
      question: typeof first.question === "string" ? first.question : "",
      header,
      options: Array.isArray(first.options) ? first.options : [],
      ...(first.multiple !== undefined ? { multiple: first.multiple } : {}),
    })
  }
  if (type === "form.replied") {
    const answers = payload.answers
    return v1("question.replied", {
      sessionID,
      requestID: formID,
      answers: Array.isArray(answers) ? answers : [],
    })
  }
  return v1("question.rejected", { sessionID, requestID: formID })
}

// Returns [rawEvent, ...synthesized]. The raw event keeps its V2 framing;
// consumers that only understand V1 shapes read the synthesized copies.
export function mapV2EventToV1(event: V2Event): V1Event[] {
  const out: V1Event[] = [v1(event.type, { ...payloadOf(event) })]
  const payload = payloadOf(event)

  switch (event.type) {
    case "session.execution.started": {
      const sessionID = sessionIDFrom(payload)
      if (sessionID !== undefined) {
        out.push(v1("session.status", { sessionID, status: "busy" }))
      }
      break
    }
    case "session.execution.succeeded":
    case "session.execution.interrupted": {
      const sessionID = sessionIDFrom(payload)
      if (sessionID !== undefined) {
        // shortcut: duplicate idle delivery is intentional — V1 consumers
        // are idempotent per session (500ms dedup window in event.ts).
        out.push(v1("session.status", { sessionID, status: "idle" }))
        out.push(v1("session.idle", { sessionID }))
      }
      break
    }
    case "session.execution.failed": {
      const sessionID = sessionIDFrom(payload)
      if (sessionID !== undefined) {
        const error = payload.error
        out.push(
          v1("session.error", {
            sessionID,
            error: typeof error === "string" ? error : (asRecord(error) ?? { message: "unknown error" }),
          }),
        )
        out.push(v1("session.status", { sessionID, status: "idle" }))
        out.push(v1("session.idle", { sessionID }))
      }
      break
    }
    case "session.created": {
      // Only child sessions synthesize early-registration; main sessions are
      // tracked through the prompt hook.
      const parentID = payload.parentID
      const sessionID = sessionIDFrom(payload)
      if (typeof parentID === "string" && sessionID !== undefined) {
        out.push(
          v1("session.created", {
            sessionID,
            info: {
              id: sessionID,
              parentID,
              ...(typeof payload.title === "string" ? { title: payload.title } : {}),
              ...(typeof payload.agent === "string" ? { agent: payload.agent } : {}),
            },
          }),
        )
      }
      break
    }
    case "session.deleted": {
      const sessionID = sessionIDFrom(payload)
      if (sessionID !== undefined) {
        // Dual id spelling: cache eviction reads info.id, the task
        // session manager reads sessionID.
        out.push(v1("session.deleted", { sessionID, info: { id: sessionID } }))
      }
      break
    }
    case "session.usage.updated":
    case "session.step.ended": {
      const sessionID = sessionIDFrom(payload)
      if (sessionID !== undefined) {
        const messageID = typeof payload.messageID === "string" ? payload.messageID : undefined
        const synthesized = usageToMessageUpdated(sessionID, payload, messageID)
        if (synthesized) out.push(synthesized)
      }
      break
    }
    case "form.created":
    case "form.replied":
    case "form.cancelled": {
      const synthesized = formToQuestion(event.type, payload)
      if (synthesized) out.push(synthesized)
      break
    }
    case "permission.asked": {
      const sessionID = sessionIDFrom(payload)
      const action = payload.action
      if (sessionID !== undefined && typeof action === "string") {
        out.push(
          v1("permission.asked", {
            sessionID,
            requestID:
              typeof payload.requestID === "string"
                ? payload.requestID
                : typeof payload.id === "string"
                  ? payload.id
                  : `${sessionID}:${action}`,
            permission: action,
            patterns: Array.isArray(payload.resources) ? payload.resources : [],
            always: Array.isArray(payload.save) ? payload.save : [],
            metadata: asRecord(payload.metadata) ?? {},
          }),
        )
      }
      break
    }
    case "permission.replied": {
      const sessionID = sessionIDFrom(payload)
      if (sessionID !== undefined) {
        out.push(
          v1("permission.replied", {
            sessionID,
            requestID:
              typeof payload.requestID === "string"
                ? payload.requestID
                : typeof payload.id === "string"
                  ? payload.id
                  : sessionID,
            reply: payload.reply ?? payload.decision,
          }),
        )
      }
      break
    }
    default:
      break
  }

  return out
}

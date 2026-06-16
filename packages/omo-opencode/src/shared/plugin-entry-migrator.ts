import { LEGACY_PLUGIN_NAME, OLDER_LEGACY_PLUGIN_NAME, PLUGIN_NAME } from "./plugin-identity"

const LEGACY_NAMES = [LEGACY_PLUGIN_NAME, OLDER_LEGACY_PLUGIN_NAME] as const

export function isLegacyEntry(entry: string): boolean {
  return LEGACY_NAMES.some(name => entry === name || entry.startsWith(`${name}@`))
}

export function isCanonicalEntry(entry: string): boolean {
  return entry === PLUGIN_NAME || entry.startsWith(`${PLUGIN_NAME}@`)
}

export function toCanonicalEntry(entry: string): string {
  for (const legacyName of LEGACY_NAMES) {
    if (entry === legacyName) return PLUGIN_NAME
    if (entry.startsWith(`${legacyName}@`)) return `${PLUGIN_NAME}${entry.slice(legacyName.length)}`
  }
  return entry
}

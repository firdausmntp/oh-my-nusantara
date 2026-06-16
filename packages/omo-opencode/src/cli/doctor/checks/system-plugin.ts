import { existsSync, readFileSync } from "node:fs"

import { LEGACY_PLUGIN_NAME, OLDER_LEGACY_PLUGIN_NAME, PLUGIN_NAME, getOpenCodeConfigPaths, parseJsonc } from "../../../shared"

const LEGACY_NAMES = [LEGACY_PLUGIN_NAME, OLDER_LEGACY_PLUGIN_NAME] as const

export interface PluginInfo {
  registered: boolean
  configPath: string | null
  entry: string | null
  isPinned: boolean
  pinnedVersion: string | null
  isLocalDev: boolean
}

interface OpenCodeConfigShape {
  plugin?: string[]
}

function detectConfigPath(): string | null {
  const paths = getOpenCodeConfigPaths({ binary: "opencode", version: null })
  if (existsSync(paths.configJsonc)) return paths.configJsonc
  if (existsSync(paths.configJson)) return paths.configJson
  return null
}

function parsePluginVersion(entry: string): string | null {
  if (entry.startsWith(`${PLUGIN_NAME}@`)) {
    const value = entry.slice(PLUGIN_NAME.length + 1)
    if (!value || value === "latest") return null
    return value
  }
  for (const legacyName of LEGACY_NAMES) {
    if (entry.startsWith(`${legacyName}@`)) {
      const value = entry.slice(legacyName.length + 1)
      if (!value || value === "latest") return null
      return value
    }
  }
  return null
}

function findPluginEntry(entries: string[]): { entry: string; isLocalDev: boolean } | null {
  for (const entry of entries) {
    if (entry === PLUGIN_NAME || entry.startsWith(`${PLUGIN_NAME}@`)) {
      return { entry, isLocalDev: false }
    }
    if (LEGACY_NAMES.some(name => entry === name || entry.startsWith(`${name}@`))) {
      return { entry, isLocalDev: false }
    }
    if (entry.startsWith("file://") && (entry.includes(PLUGIN_NAME) || LEGACY_NAMES.some(name => entry.includes(name)))) {
      return { entry, isLocalDev: true }
    }
  }

  return null
}

export function getPluginInfo(): PluginInfo {
  const configPath = detectConfigPath()
  if (!configPath) {
    return {
      registered: false,
      configPath: null,
      entry: null,
      isPinned: false,
      pinnedVersion: null,
      isLocalDev: false,
    }
  }

  try {
    const content = readFileSync(configPath, "utf-8")
    const parsedConfig = parseJsonc<OpenCodeConfigShape>(content)
    const pluginEntry = findPluginEntry(parsedConfig.plugin ?? [])
    if (!pluginEntry) {
      return {
        registered: false,
        configPath,
        entry: null,
        isPinned: false,
        pinnedVersion: null,
        isLocalDev: false,
      }
    }

    const pinnedVersion = parsePluginVersion(pluginEntry.entry)
    return {
      registered: true,
      configPath,
      entry: pluginEntry.entry,
      isPinned: pinnedVersion !== null && /^\d+\.\d+\.\d+/.test(pinnedVersion ?? ""),
      pinnedVersion,
      isLocalDev: pluginEntry.isLocalDev,
    }
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error
    }

    return {
      registered: false,
      configPath,
      entry: null,
      isPinned: false,
      pinnedVersion: null,
      isLocalDev: false,
    }
  }
}

export { detectConfigPath, findPluginEntry }

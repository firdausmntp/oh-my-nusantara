// postinstall.mjs
// Runs after npm install to verify platform binary is available

import { readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  getPlatformPackageCandidates,
  getBinaryPath,
  resolvePlatformPackageBaseName,
} from "./bin/platform.js";
import { detectPlatformBinaryMismatch } from "./bin/version-mismatch.js";

const require = createRequire(import.meta.url);

const MIN_OPENCODE_VERSION = "1.4.0";
const OPENCODE_PLUGIN_PACKAGES = ["oh-my-nusantara", "oh-my-opencode", "oh-my-openagent"];

/**
 * Parse version string into numeric parts
 * @param {string} version
 * @returns {number[]}
 */
function parseVersion(version) {
  return version
    .replace(/^v/, "")
    .split("-")[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

/**
 * Compare two version strings
 * @param {string} current
 * @param {string} minimum
 * @returns {boolean} true if current >= minimum
 */
function compareVersions(current, minimum) {
  const currentParts = parseVersion(current);
  const minimumParts = parseVersion(minimum);
  const length = Math.max(currentParts.length, minimumParts.length);

  for (let index = 0; index < length; index++) {
    const currentPart = currentParts[index] ?? 0;
    const minimumPart = minimumParts[index] ?? 0;
    if (currentPart > minimumPart) return true;
    if (currentPart < minimumPart) return false;
  }

  return true;
}

/**
 * Check if opencode version meets minimum requirement
 * @returns {{ok: boolean, version: string | null}}
 */
function checkOpenCodeVersion() {
  try {
    const result = require("child_process").execSync("opencode --version", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"],
    });
    const version = result.trim();
    const ok = compareVersions(version, MIN_OPENCODE_VERSION);
    return { ok, version };
  } catch {
    return { ok: true, version: null };
  }
}

/**
 * Detect libc family on Linux
 */
function getLibcFamily() {
  if (process.platform !== "linux") {
    return undefined;
  }
  
  try {
    const detectLibc = require("detect-libc");
    return detectLibc.familySync();
  } catch {
    return null;
  }
}

function readMainPackageJson() {
  try {
    return JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  } catch {
    return null;
  }
}

function getPackageBaseName() {
  const packageJson = readMainPackageJson();
  return resolvePlatformPackageBaseName(packageJson?.name || "oh-my-opencode");
}

function getMainPackageVersion() {
  const packageJson = readMainPackageJson();
  return packageJson?.version ?? null;
}

function invalidateOpenCodePluginCache() {
  const cacheDir = join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "opencode");
  const parentDirs = [cacheDir, join(cacheDir, "packages")];
  const prefixes = OPENCODE_PLUGIN_PACKAGES.map((packageName) => `${packageName}@`);

  for (const parentDir of parentDirs) {
    try {
      for (const entry of readdirSync(parentDir, { withFileTypes: true })) {
        if (entry.isDirectory() && prefixes.some((prefix) => entry.name.startsWith(prefix))) {
          rmSync(join(parentDir, entry.name), { recursive: true, force: true });
        }
      }
    } catch {
      // Cache invalidation is best-effort; postinstall should not fail package installs.
    }
  }
}

function readPlatformPackageVersion(pkg) {
  try {
    const platformPackageJsonPath = require.resolve(`${pkg}/package.json`);
    const packageJson = JSON.parse(readFileSync(platformPackageJsonPath, "utf8"));
    return packageJson.version ?? null;
  } catch {
    return null;
  }
}

function main() {
  const { platform, arch } = process;
  const libcFamily = getLibcFamily();
  const packageBaseName = getPackageBaseName();

  invalidateOpenCodePluginCache();

  // Check opencode version requirement
  const versionCheck = checkOpenCodeVersion();
  if (versionCheck.version && !versionCheck.ok) {
    console.warn(`⚠ oh-my-nusantara requires OpenCode >= ${MIN_OPENCODE_VERSION}`);
    console.warn(`  Detected: ${versionCheck.version}`);
    console.warn(`  Please update OpenCode to avoid compatibility issues.`);
  }

  // oh-my-nusantara does not ship platform binaries;
  // it runs as a Node.js package directly. Skip binary check.
  console.log(`✓ oh-my-nusantara installed for ${platform}-${arch}`);
}

main();

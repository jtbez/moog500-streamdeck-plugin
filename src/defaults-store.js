/**
 * Persistent storage using macOS `defaults` command.
 * Domain: com.moog500.presetbuilder
 *
 * Each stored parameter is keyed like: "param.Feedback" → JSON string of { value, displayValue }
 * Global settings are keyed like: "global.qlabHost", "global.midiChannel", etc.
 */

const { execSync } = require("child_process");

const DOMAIN = "com.moog500.presetbuilder";

function writeDefault(key, value) {
  const escaped = JSON.stringify(value).replace(/'/g, "'\\''");
  try {
    execSync(`defaults write ${DOMAIN} '${key}' -string '${escaped}'`, { timeout: 5000 });
    return true;
  } catch (e) {
    console.error(`[defaults] write failed for ${key}:`, e.message);
    return false;
  }
}

function readDefault(key) {
  try {
    const raw = execSync(`defaults read ${DOMAIN} '${key}'`, { timeout: 5000, encoding: "utf8" });
    return JSON.parse(raw.trim());
  } catch (e) {
    return undefined;
  }
}

function deleteDefault(key) {
  try {
    execSync(`defaults delete ${DOMAIN} '${key}'`, { timeout: 5000 });
    return true;
  } catch (e) {
    return false;
  }
}

function listKeys() {
  try {
    const raw = execSync(`defaults read ${DOMAIN}`, { timeout: 5000, encoding: "utf8" });
    // Parse the plist-style output to extract keys
    const keys = [];
    const regex = /^\s*"?([^"=]+)"?\s*=/gm;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      keys.push(match[1].trim());
    }
    return keys;
  } catch (e) {
    return [];
  }
}

// ── High-level param storage ─────────────────────────────────────────────

function storeParamValue(paramName, value, displayValue) {
  return writeDefault(`param.${paramName}`, { value, displayValue, updatedAt: Date.now() });
}

function readParamValue(paramName) {
  return readDefault(`param.${paramName}`);
}

function clearParamValue(paramName) {
  return deleteDefault(`param.${paramName}`);
}

function readAllParams() {
  const keys = listKeys().filter(k => k.startsWith("param."));
  const result = {};
  for (const key of keys) {
    const paramName = key.slice("param.".length);
    const data = readDefault(key);
    if (data) result[paramName] = data;
  }
  return result;
}

function clearAllParams() {
  const keys = listKeys().filter(k => k.startsWith("param."));
  for (const key of keys) deleteDefault(key);
}

// ── High-level global settings ───────────────────────────────────────────

function storeGlobal(key, value) {
  return writeDefault(`global.${key}`, value);
}

function readGlobal(key) {
  return readDefault(`global.${key}`);
}

function getGlobalSettings() {
  return {
    qlabHost: readGlobal("qlabHost") || "127.0.0.1",
    qlabPort: readGlobal("qlabPort") || 53000,
    midiPatch: readGlobal("midiPatch") || 1,
    midiChannel: readGlobal("midiChannel") || 1,
    midiDeviceName: readGlobal("midiDeviceName") || "",
    preWaitInterval: readGlobal("preWaitInterval") || 0.1,
    groupName: readGlobal("groupName") || "Moog 500 Preset",
    cueListNumber: readGlobal("cueListNumber") || "",
    workspaceId: readGlobal("workspaceId") || ""
  };
}

module.exports = {
  writeDefault,
  readDefault,
  deleteDefault,
  listKeys,
  storeParamValue,
  readParamValue,
  clearParamValue,
  readAllParams,
  clearAllParams,
  storeGlobal,
  readGlobal,
  getGlobalSettings
};

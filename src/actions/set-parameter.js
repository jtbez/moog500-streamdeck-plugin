/**
 * Set Parameter Action
 * Handles both Keypad (button press → AppleScript dialog) and Encoder (dial rotate) modes.
 */

const { streamDeck, SingletonAction } = require("@elgato/streamdeck");
const { execSync } = require("child_process");
const { PARAMETERS, resolveParameter, getInteractionType } = require("../parameters");
const store = require("../defaults-store");
const midiOut = require("../midi-out");

class SetParameterAction extends SingletonAction {
  constructor() {
    super();
    this.manifestId = "com.moog500.presetbuilder.set-parameter";
    this._activeActions = new Map(); // context → { action, settings }
  }

  async refreshAll() {
    for (const { action, settings } of this._activeActions.values()) {
      const paramName = settings.parameterType;
      if (paramName) await this._refreshDisplay(action, paramName, settings);
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async onWillAppear(ev) {
    const settings = ev.payload.settings || {};
    this._activeActions.set(ev.action.id, { action: ev.action, settings });
    const paramName = settings.parameterType;
    if (!paramName) {
      await ev.action.setTitle("Config\nNeeded");
      return;
    }
    await this._refreshDisplay(ev.action, paramName, settings);
  }

  async onWillDisappear(ev) {
    this._activeActions.delete(ev.action.id);
  }

  async onDidReceiveSettings(ev) {
    const settings = ev.payload.settings || {};
    this._activeActions.set(ev.action.id, { action: ev.action, settings });
    const paramName = settings.parameterType;
    if (paramName) {
      await this._refreshDisplay(ev.action, paramName, settings);
    }
  }

  // ── Keypad: button press → toggle (2-option) or native dialog ─────────

  async onKeyDown(ev) {
    const settings = ev.payload.settings || {};
    const paramName = settings.parameterType;
    if (!paramName) {
      await ev.action.showAlert();
      return;
    }

    const def = PARAMETERS[paramName];
    if (!def) {
      await ev.action.showAlert();
      return;
    }

    // Boolean/binary params toggle directly — no dialog needed
    const interactionType = getInteractionType(paramName);
    if (interactionType === "boolean" || interactionType === "binary") {
      const keys = Object.keys(def.options);
      const stored = store.readParamValue(paramName);
      const current = stored ? stored.value : def.default;
      const idx = Math.max(0, keys.indexOf(current));
      const newValue = keys[(idx + 1) % 2];
      const result = resolveParameter(paramName, newValue);
      store.storeParamValue(paramName, newValue, result.displayValue);
      this._sendMidi(result, paramName);
      await this._refreshDisplay(ev.action, paramName, settings);
      await ev.action.showOk();
      return;
    }

    try {
      const userValue = await this._promptForValue(paramName, def);
      if (userValue === null) return; // cancelled

      const result = resolveParameter(paramName, userValue);
      if (!result.valid) {
        await ev.action.showAlert();
        return;
      }

      this._store(paramName, def, userValue, result);
      this._sendMidi(result, paramName);

      await this._refreshDisplay(ev.action, paramName, settings);
      await ev.action.showOk();
    } catch (e) {
      streamDeck.logger.error(`SetParameter keyDown error: ${e.message}`);
      await ev.action.showAlert();
    }
  }

  // ── Encoder: dial rotate ───────────────────────────────────────────────

  async onDialRotate(ev) {
    const settings = ev.payload.settings || {};
    const paramName = settings.parameterType;
    if (!paramName) return;

    const def = PARAMETERS[paramName];
    if (!def) return;

    const stored = store.readParamValue(paramName);
    let currentValue = stored ? stored.value : def.default;
    const ticks = ev.payload.ticks;

    // Adjust value based on parameter type
    if (def.type === "percent_7bit" || def.type === "percent_14bit") {
      const step = ev.payload.pressed ? 1 : 5;
      currentValue = Math.max(0, Math.min(100, (currentValue || 0) + ticks * step));
    } else if (def.type === "continuous_ms") {
      const step = ev.payload.pressed ? 1 : (def.encoderStep || 5);
      currentValue = Math.max(def.min, Math.min(def.max, (currentValue || def.default) + ticks * step));
    } else if (def.type === "discrete") {
      const keys = Object.keys(def.options);
      let idx = keys.indexOf(currentValue);
      if (idx < 0) idx = 0;
      idx = Math.max(0, Math.min(keys.length - 1, idx + (ticks > 0 ? 1 : -1)));
      currentValue = keys[idx];
    } else if (def.type === "computed_delay") {
      // For computed delay on encoder, adjust BPM
      if (typeof currentValue !== "object") {
        currentValue = {
          timeSignature: def.inputs.timeSignature.default,
          bpm: def.inputs.bpm.default,
          beatUnit: def.inputs.beatUnit.default,
          beatDivision: def.inputs.beatDivision.default
        };
      }
      const step = ev.payload.pressed ? 0.1 : 1;
      currentValue.bpm = Math.max(
        def.inputs.bpm.min,
        Math.min(def.inputs.bpm.max, currentValue.bpm + ticks * step)
      );
      currentValue.bpm = Math.round(currentValue.bpm * 10) / 10;
    }

    const result = resolveParameter(paramName, currentValue);
    this._store(paramName, def, currentValue, result);
    this._sendMidi(result, paramName);

    // Update encoder feedback
    await this._updateEncoderFeedback(ev.action, def, currentValue, result);
  }

  // ── Encoder: dial press (reset to default) ─────────────────────────────

  async onDialDown(ev) {
    const settings = ev.payload.settings || {};
    const paramName = settings.parameterType;
    if (!paramName) return;

    const def = PARAMETERS[paramName];
    if (!def) return;

    const defaultValue = def.default ||
      (def.type === "computed_delay" ? {
        timeSignature: def.inputs.timeSignature.default,
        bpm: def.inputs.bpm.default,
        beatUnit: def.inputs.beatUnit.default,
        beatDivision: def.inputs.beatDivision.default
      } : 0);

    const result = resolveParameter(paramName, defaultValue);
    this._store(paramName, def, defaultValue, result);
    this._sendMidi(result, paramName);

    await this._updateEncoderFeedback(ev.action, def, defaultValue, result);
  }

  // ── Encoder: touch tap (open dialog like keypad) ───────────────────────

  async onTouchTap(ev) {
    // Reuse the keypad dialog flow
    await this.onKeyDown(ev);
  }

  // ── Native macOS Dialog via AppleScript ────────────────────────────────

  async _promptForValue(paramName, def) {
    switch (def.type) {
      case "discrete": {
        const keys = Object.keys(def.options);
        const listStr = keys.map(k => `"${k}"`).join(", ");
        const script = `choose from list {${listStr}} with prompt "Select ${def.label}:" with title "Moog 500 — ${def.label}" default items {"${def.default}"}`;
        const raw = execSync(`osascript -e '${script}'`, { encoding: "utf8", timeout: 30000 }).trim();
        if (raw === "false") return null;
        return raw;
      }

      case "percent_7bit":
      case "percent_14bit": {
        const stored = store.readParamValue(paramName);
        const currentVal = stored ? stored.value : def.default;
        const script = `text returned of (display dialog "Enter ${def.label} (0–100%):" with title "Moog 500 — ${def.label}" default answer "${currentVal}")`;
        const raw = execSync(`osascript -e '${script}'`, { encoding: "utf8", timeout: 30000 }).trim();
        if (!raw) return null;
        const num = parseFloat(raw);
        if (isNaN(num)) return null;
        return Math.max(0, Math.min(100, num));
      }

      case "continuous_ms": {
        const stored = store.readParamValue(paramName);
        const currentVal = stored ? stored.value : def.default;
        const script = `text returned of (display dialog "Enter ${def.label} (${def.min}–${def.max} ms):" with title "Moog 500 — ${def.label}" default answer "${currentVal}")`;
        const raw = execSync(`osascript -e '${script}'`, { encoding: "utf8", timeout: 30000 }).trim();
        if (!raw) return null;
        const num = parseFloat(raw);
        if (isNaN(num)) return null;
        return Math.max(def.min, Math.min(def.max, Math.round(num)));
      }

      case "computed_delay": {
        const stored = store.readParamValue(paramName);
        const current = stored ? stored.value : {
          timeSignature: def.inputs.timeSignature.default,
          bpm: def.inputs.bpm.default,
          beatUnit: def.inputs.beatUnit.default,
          beatDivision: def.inputs.beatDivision.default
        };

        // Time Signature
        const sigKeys = Object.keys(def.inputs.timeSignature.options);
        const sigList = sigKeys.map(k => `"${k}"`).join(", ");
        let script = `choose from list {${sigList}} with prompt "Select time signature:" with title "Moog 500 — Time Signature" default items {"${current.timeSignature || def.inputs.timeSignature.default}"}`;
        let raw = execSync(`osascript -e '${script}'`, { encoding: "utf8", timeout: 30000 }).trim();
        if (raw === "false") return null;
        const timeSignature = raw;

        // BPM
        script = `text returned of (display dialog "Enter BPM (${def.inputs.bpm.min}–${def.inputs.bpm.max}):" with title "Moog 500 — Delay Time" default answer "${current.bpm}")`;
        raw = execSync(`osascript -e '${script}'`, { encoding: "utf8", timeout: 30000 }).trim();
        if (!raw) return null;
        const bpm = parseFloat(raw);
        if (isNaN(bpm)) return null;

        // Beat Unit
        const unitKeys = Object.keys(def.inputs.beatUnit.options);
        const unitList = unitKeys.map(k => `"${k}"`).join(", ");
        script = `choose from list {${unitList}} with prompt "Select beat unit:" with title "Moog 500 — Beat Unit" default items {"${current.beatUnit}"}`;
        raw = execSync(`osascript -e '${script}'`, { encoding: "utf8", timeout: 30000 }).trim();
        if (raw === "false") return null;
        const beatUnit = raw;

        // Beat Division
        const divKeys = Object.keys(def.inputs.beatDivision.options);
        const divList = divKeys.map(k => `"${k}"`).join(", ");
        script = `choose from list {${divList}} with prompt "Select beat division:" with title "Moog 500 — Beat Division" default items {"${current.beatDivision}"}`;
        raw = execSync(`osascript -e '${script}'`, { encoding: "utf8", timeout: 30000 }).trim();
        if (raw === "false") return null;
        const beatDivision = raw;

        return {
          timeSignature,
          bpm: Math.max(def.inputs.bpm.min, Math.min(def.inputs.bpm.max, bpm)),
          beatUnit,
          beatDivision
        };
      }

      default:
        return null;
    }
  }

  // ── Store param value, merging computed outputs for computed_delay ─────

  _store(paramName, def, userInputs, result) {
    const value = (def.type === "computed_delay" && result.computed)
      ? { ...userInputs, ...result.computed }
      : userInputs;
    store.storeParamValue(paramName, value, result.displayValue);
  }

  // ── MIDI Output ────────────────────────────────────────────────────────

  _sendMidi(result, paramName) {
    if (!result.valid || !result.cues.length) return;
    const disabledParams = store.readGlobal("disabledParams") || [];
    if (paramName && disabledParams.includes(paramName)) return;
    const { midiChannel } = store.getGlobalSettings();
    const sent = midiOut.sendCues(result.cues, midiChannel);
    if (!sent) {
      streamDeck.logger.warn("MIDI not sent — no device open. Configure one in the Commit button settings.");
    }
  }

  // ── Display Helpers ────────────────────────────────────────────────────

  async _refreshDisplay(action, paramName, settings) {
    const def = PARAMETERS[paramName];
    if (!def) {
      await action.setTitle(paramName.substring(0, 10));
      return;
    }

    const stored = store.readParamValue(paramName);
    const rawDisplay = stored ? stored.displayValue : "—";

    // Encoder prefix: "E1 ", "E2 ", etc.
    const prefix = settings.encoderIndex ? `E${settings.encoderIndex} ` : "";
    const maxLen = settings.encoderIndex ? 9 : 12;
    const label = def.label.substring(0, maxLen);

    // Boolean params get a ● / ○ state indicator
    const interactionType = getInteractionType(paramName);
    let valueDisplay = rawDisplay;
    if (interactionType === "boolean" && stored) {
      valueDisplay = stored.value === "On" ? "● ON" : "○ OFF";
    }

    await action.setTitle(`${prefix}${label}\n${valueDisplay}`);

    // Encoder feedback (if applicable)
    if (stored) {
      const result = resolveParameter(paramName, stored.value);
      await this._updateEncoderFeedback(action, def, stored.value, result);
    }
  }

  async _updateEncoderFeedback(action, def, currentValue, result) {
    try {
      let barValue = 0;
      if (def.type === "percent_7bit" || def.type === "percent_14bit") {
        barValue = Math.round(currentValue);
      } else if (def.type === "continuous_ms") {
        barValue = Math.round(((currentValue - def.min) / (def.max - def.min)) * 100);
      } else if (def.type === "discrete") {
        const keys = Object.keys(def.options);
        const idx = keys.indexOf(currentValue);
        barValue = keys.length > 1 ? Math.round((idx / (keys.length - 1)) * 100) : 50;
      } else if (def.type === "computed_delay" && typeof currentValue === "object") {
        barValue = Math.round(((currentValue.bpm - 20) / (300 - 20)) * 100);
      }

      await action.setFeedback({
        paramName: def.label,
        valueDisplay: result.displayValue,
        rangeBar: { value: barValue }
      });
    } catch (e) {
      // setFeedback only works on encoder devices; ignore errors on keypad
    }
  }
}

module.exports = { SetParameterAction };

/**
 * Reset to Defaults Action
 * Sends a known-good set of MIDI CC values and stores them to persistent storage.
 * Values are taken from the property inspector settings, falling back to FACTORY_DEFAULTS.
 * The factory-default verification in reset-defaults.js remains authoritative for the
 * hardcoded constants; that check is only run when no user overrides are in effect.
 */

const { streamDeck, SingletonAction } = require("@elgato/streamdeck");
const { PARAMETERS, resolveParameter } = require("../parameters");
const { FACTORY_DEFAULTS, verifyResetCues } = require("../reset-defaults");
const store = require("../defaults-store");
const midiOut = require("../midi-out");

function _buildEffectiveDefaults(settings) {
  const fd = FACTORY_DEFAULTS;
  const d = fd["Delay Time (BPM Sync)"];

  const num = (key, fallback) => {
    const v = settings[key];
    return (v !== undefined && v !== "") ? parseFloat(v) : fallback;
  };
  const str = (key, fallback) => settings[key] || fallback;

  return {
    "Delay Time (BPM Sync)": {
      timeSignature: str("delayTimeSignature", d.timeSignature),
      bpm:           num("delayBpm",           d.bpm),
      beatUnit:      str("delayBeatUnit",       d.beatUnit),
      beatDivision:  str("delayBeatDivision",   d.beatDivision)
    },
    "Feedback":         num("feedback",        fd["Feedback"]),
    "LFO Shape":        str("lfoShape",        fd["LFO Shape"]),
    "LFO Rate":         num("lfoRate",         fd["LFO Rate"]),
    "LFO Amount":       num("lfoAmount",       fd["LFO Amount"]),
    "Filter Mode":      str("filterMode",      fd["Filter Mode"]),
    "Time Sync On/Off": str("timeSyncOnOff",   fd["Time Sync On/Off"])
  };
}

function _isFactoryDefaults(settings) {
  return !settings || Object.keys(settings).length === 0;
}

class ResetAction extends SingletonAction {
  constructor(setParameterAction) {
    super();
    this.manifestId = "com.moog500.presetbuilder.reset";
    this._setParameterAction = setParameterAction;
  }

  async onWillAppear(ev) {
    await ev.action.setTitle("RESET\nMoog 500");
  }

  async onKeyDown(ev) {
    await ev.action.setState(1);

    const settings = ev.payload.settings || {};
    const effectiveDefaults = _buildEffectiveDefaults(settings);

    try {
      const allCues = [];

      for (const [paramName, defaultValue] of Object.entries(effectiveDefaults)) {
        const def = PARAMETERS[paramName];
        if (!def) {
          streamDeck.logger.warn(`Reset: unknown parameter "${paramName}"`);
          continue;
        }

        const result = resolveParameter(paramName, defaultValue);
        if (!result.valid) {
          streamDeck.logger.warn(`Reset: invalid result for "${paramName}"`);
          continue;
        }

        const storedValue = (def.type === "computed_delay" && result.computed)
          ? { ...defaultValue, ...result.computed }
          : defaultValue;
        store.storeParamValue(paramName, storedValue, result.displayValue);

        allCues.push(...result.cues);
      }

      // Only verify against EXPECTED_RESET_CUES when no user overrides are active,
      // since those constants reflect factory defaults specifically.
      let showOk = true;
      if (_isFactoryDefaults(settings)) {
        const { allPass, lines } = verifyResetCues(allCues);
        streamDeck.logger.info(`Reset verification: ${allPass ? "PASS — all CC values match" : "FAIL — some CC values differ"}`);
        for (const line of lines) streamDeck.logger.info(line);
        showOk = allPass;
      }

      const { midiChannel } = store.getGlobalSettings();
      const sent = midiOut.sendCues(allCues, midiChannel);
      if (!sent) {
        streamDeck.logger.warn("Reset: MIDI not sent — no device open.");
      }

      await this._setParameterAction.refreshAll();

      if (showOk) {
        await ev.action.showOk();
      } else {
        await ev.action.showAlert();
      }
    } catch (e) {
      streamDeck.logger.error(`Reset error: ${e.message}`);
      await ev.action.showAlert();
    }

    await ev.action.setState(0);
    await ev.action.setTitle("RESET\nMoog 500");
  }
}

module.exports = { ResetAction };

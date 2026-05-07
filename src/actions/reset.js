/**
 * Reset to Defaults Action
 * Sends a known-good set of MIDI CC values and stores them to persistent storage.
 * The expected output can be used to verify that all calculations are correct.
 */

const { streamDeck, SingletonAction } = require("@elgato/streamdeck");
const { PARAMETERS, resolveParameter } = require("../parameters");
const { FACTORY_DEFAULTS, verifyResetCues } = require("../reset-defaults");
const store = require("../defaults-store");
const midiOut = require("../midi-out");

class ResetAction extends SingletonAction {
  constructor() { super(); this.manifestId = "com.moog500.presetbuilder.reset"; }

  async onWillAppear(ev) {
    await ev.action.setTitle("RESET\nMoog 500");
  }

  async onKeyDown(ev) {
    await ev.action.setState(1);

    try {
      const allCues = [];

      for (const [paramName, defaultValue] of Object.entries(FACTORY_DEFAULTS)) {
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

        // Store inputs + computed values to persistent storage
        const storedValue = (def.type === "computed_delay" && result.computed)
          ? { ...defaultValue, ...result.computed }
          : defaultValue;
        store.storeParamValue(paramName, storedValue, result.displayValue);

        allCues.push(...result.cues);
      }

      // Verify computed cues against expected before sending
      const { allPass, lines } = verifyResetCues(allCues);
      streamDeck.logger.info(`Reset verification: ${allPass ? "PASS — all CC values match" : "FAIL — some CC values differ"}`);
      for (const line of lines) streamDeck.logger.info(line);

      // Send all CCs
      const { midiChannel } = store.getGlobalSettings();
      const sent = midiOut.sendCues(allCues, midiChannel);
      if (!sent) {
        streamDeck.logger.warn("Reset: MIDI not sent — no device open.");
      }

      if (allPass) {
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

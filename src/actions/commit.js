/**
 * Commit to QLab Action
 * Reads all stored parameter values, resolves them to MIDI CCs,
 * and builds a QLab cue group via OSC.
 * 
 * IMPORTANT: MIDI sends happen immediately when parameters are changed via SetParameterAction.
 * This commit action ONLY interacts with QLab.
 * 
 * This action also manages the global MIDI device configuration
 * which SetParameterAction uses for immediate CC sending.
 */

const { streamDeck, SingletonAction } = require("@elgato/streamdeck");
const { execSync } = require("child_process");
const { resolveParameter } = require("../parameters");
const store = require("../defaults-store");
const { QLab } = require("../qlab-osc");
const midiOut = require("../midi-out");

class CommitAction extends SingletonAction {
  constructor() { super(); this.manifestId = "com.moog500.presetbuilder.commit"; }

  async onWillAppear(ev) {
    const allParams = store.readAllParams();
    const settings = ev.payload.settings || {};
    const disabledParams = settings.disabledParams || [];
    const count = Object.keys(allParams).filter(n => !disabledParams.includes(n)).length;
    await ev.action.setTitle(`COMMIT\n${count} params`);
  }

  async onDidReceiveSettings(ev) {
    const settings = ev.payload.settings || {};
    if (settings.qlabHost) store.storeGlobal("qlabHost", settings.qlabHost);
    if (settings.qlabPort) store.storeGlobal("qlabPort", parseInt(settings.qlabPort, 10));
    if (settings.midiPatch) store.storeGlobal("midiPatch", parseInt(settings.midiPatch, 10));
    if (settings.midiChannel) store.storeGlobal("midiChannel", parseInt(settings.midiChannel, 10));
    if (settings.preWaitInterval) store.storeGlobal("preWaitInterval", parseFloat(settings.preWaitInterval));
    if (settings.cueListNumber !== undefined) store.storeGlobal("cueListNumber", settings.cueListNumber);
    if (settings.workspaceId !== undefined) store.storeGlobal("workspaceId", settings.workspaceId);
    if (settings.disabledParams !== undefined) store.storeGlobal("disabledParams", settings.disabledParams);

    // Update button title to reflect current filtered count
    const allParams = store.readAllParams();
    const disabledParams = settings.disabledParams || store.readGlobal("disabledParams") || [];
    const count = Object.keys(allParams).filter(n => !disabledParams.includes(n)).length;
    await ev.action.setTitle(`COMMIT\n${count} params`);

    // Handle MIDI device configuration (used by SetParameterAction for immediate sends)
    if (settings.midiDeviceName !== undefined) {
      store.storeGlobal("midiDeviceName", settings.midiDeviceName);
      if (settings.midiDeviceName) {
        const opened = midiOut.open(settings.midiDeviceName);
        streamDeck.logger.info(`MIDI device "${settings.midiDeviceName}": ${opened ? "opened" : "not found"}`);
      } else {
        midiOut.close();
      }
    }
  }

  async onSendToPlugin(ev) {
    const cmd = ev.payload.command;

    if (cmd === "getStoredCount") {
      const allParams = store.readAllParams();
      const disabledParams = store.readGlobal("disabledParams") || [];
      const count = Object.keys(allParams).filter(n => !disabledParams.includes(n)).length;
      await streamDeck.ui.sendToPropertyInspector({ storedCount: count });
    }

    if (cmd === "getDevices") {
      await streamDeck.ui.sendToPropertyInspector({
        midiDevices: midiOut.getDevices(),
        selectedDevice: store.readGlobal("midiDeviceName") || ""
      });
    }
  }

  async onKeyDown(ev) {
    const allParams = store.readAllParams();
    const disabledParams = store.readGlobal("disabledParams") || [];
    const paramNames = Object.keys(allParams).filter(n => !disabledParams.includes(n));

    if (paramNames.length === 0) {
      await ev.action.showAlert();
      streamDeck.logger.warn("Commit: No enabled parameters stored.");
      return;
    }

    // Set visual state to "Sending..."
    await ev.action.setState(1);

    try {
      // Resolve all parameter values into flat MIDI cue list for QLab
      const midiCues = [];
      for (const paramName of paramNames) {
        const data = allParams[paramName];
        const result = resolveParameter(paramName, data.value);
        if (result.valid) {
          midiCues.push(...result.cues);
        } else {
          streamDeck.logger.warn(`Commit: Skipping invalid param "${paramName}"`);
        }
      }

      if (midiCues.length === 0) {
        await ev.action.showAlert();
        await ev.action.setState(0);
        return;
      }

      // Deduplicate: if same CC appears multiple times, keep the last one
      const ccMap = new Map();
      for (const cue of midiCues) {
        ccMap.set(cue.cc, cue);
      }
      const dedupedCues = Array.from(ccMap.values());

      // Sort by CC number for consistent ordering
      dedupedCues.sort((a, b) => a.cc - b.cc);

      // Get global settings
      const globals = store.getGlobalSettings();

      // Prompt for a sequential, meaningful cue name
      let cueName = await this._promptForCueName();
      if (!cueName) {
        // User cancelled
        await ev.action.setState(0);
        return;
      }

      // Connect to QLab and build the cue group
      const qlab = new QLab(globals.qlabHost, globals.qlabPort);

      try {
        streamDeck.logger.info(`Commit: Building ${dedupedCues.length} MIDI cues in QLab...`);

        const result = await qlab.buildMidiCueGroup(
          {
            workspaceId: globals.workspaceId,
            midiPatch: globals.midiPatch,
            midiChannel: globals.midiChannel,
            preWaitInterval: globals.preWaitInterval
          },
          dedupedCues,
          cueName
        );

        streamDeck.logger.info(`Commit: Success — ${result.cueCount} cues created.`);
        await ev.action.showOk();
      } finally {
        qlab.close();
      }
    } catch (e) {
      streamDeck.logger.error(`Commit error: ${e.message}`);
      await ev.action.showAlert();
    }

    // Restore state
    await ev.action.setState(0);

    // Refresh the button title with current filtered count
    const remaining = store.readAllParams();
    const currentDisabled = store.readGlobal("disabledParams") || [];
    const count = Object.keys(remaining).filter(n => !currentDisabled.includes(n)).length;
    await ev.action.setTitle(`COMMIT\n${count} params`);
  }

  /**
   * Prompt for a meaningful cue name via AppleScript.
   * Offers a default sequential name based on timestamp or suggestion.
   */
  async _promptForCueName() {
    try {
      // Generate a default sequential name: "Preset 001", "Preset 002", etc.
      const count = (store.readGlobal("sequentialCueCount") || 0) + 1;
      store.storeGlobal("sequentialCueCount", count);
      const defaultName = `Preset ${String(count).padStart(3, '0')}`;

      const script = `text returned of (display dialog "Enter name for this preset cue:" with title "Moog 500 — Commit to QLab" default answer "${defaultName}")`;
      const raw = execSync(`osascript -e '${script}'`, { encoding: "utf8", timeout: 30000 }).trim();
      if (raw) {
        return raw;
      }
    } catch (e) {
      // User cancelled
      if (e.message && e.message.includes("User canceled")) {
        return null;
      }
      streamDeck.logger.error(`Cue name prompt error: ${e.message}`);
    }
    return null;
  }
}

module.exports = { CommitAction };

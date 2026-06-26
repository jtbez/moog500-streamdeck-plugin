/**
 * Moog 500 Preset Builder — Stream Deck Plugin Entry Point
 */

const { streamDeck } = require("@elgato/streamdeck");
const { SetParameterAction } = require("./actions/set-parameter");
const { CommitAction } = require("./actions/commit");
const { ResetAction } = require("./actions/reset");
const store = require("./defaults-store");
const midiOut = require("./midi-out");

// Re-open the saved MIDI device on startup
const savedDevice = store.readGlobal("midiDeviceName");
if (savedDevice) midiOut.open(savedDevice);

// Register actions
const setParameterAction = new SetParameterAction();
streamDeck.actions.registerAction(setParameterAction);
streamDeck.actions.registerAction(new CommitAction());
streamDeck.actions.registerAction(new ResetAction(setParameterAction));

// Connect to Stream Deck
streamDeck.connect();

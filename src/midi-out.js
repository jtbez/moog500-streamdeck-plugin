/**
 * Direct MIDI output singleton.
 * Wraps node-midi (RtMidi) for sending CC messages to a hardware device.
 */

const midi = require("midi");

class MidiOutput {
  constructor() {
    this._port = new midi.Output();
    this._open = false;
    this._deviceName = null;
  }

  // Returns array of available MIDI output port names
  getDevices() {
    const count = this._port.getPortCount();
    const devices = [];
    for (let i = 0; i < count; i++) {
      devices.push(this._port.getPortName(i));
    }
    return devices;
  }

  // Opens the named port; closes any previously open port first
  open(deviceName) {
    if (this._open) {
      this._port.closePort();
      this._open = false;
      this._deviceName = null;
    }
    if (!deviceName) return false;

    const count = this._port.getPortCount();
    for (let i = 0; i < count; i++) {
      if (this._port.getPortName(i) === deviceName) {
        this._port.openPort(i);
        this._open = true;
        this._deviceName = deviceName;
        return true;
      }
    }
    return false;
  }

  // Sends an array of { cc, value } cues as MIDI CC messages on the given channel (1-16)
  sendCues(cues, midiChannel = 1) {
    if (!this._open) return false;
    const status = 0xB0 | ((midiChannel - 1) & 0x0F);
    for (const cue of cues) {
      this._port.sendMessage([status, cue.cc & 0x7F, cue.value & 0x7F]);
    }
    return true;
  }

  get isOpen() { return this._open; }
  get deviceName() { return this._deviceName; }

  close() {
    if (this._open) {
      this._port.closePort();
      this._open = false;
      this._deviceName = null;
    }
  }
}

module.exports = new MidiOutput();

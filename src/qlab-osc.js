/**
 * Lightweight OSC UDP client for talking to QLab.
 * Implements just enough of the OSC 1.0 spec to send QLab commands.
 */

const dgram = require("dgram");

// ── OSC encoding helpers ─────────────────────────────────────────────────

function oscString(str) {
  const buf = Buffer.from(str + "\0", "utf8");
  const pad = 4 - (buf.length % 4);
  return pad < 4 ? Buffer.concat([buf, Buffer.alloc(pad)]) : buf;
}

function oscInt(n) {
  const buf = Buffer.alloc(4);
  buf.writeInt32BE(n, 0);
  return buf;
}

function oscFloat(n) {
  const buf = Buffer.alloc(4);
  buf.writeFloatBE(n, 0);
  return buf;
}

/**
 * Build an OSC message buffer.
 * @param {string} address  OSC address pattern
 * @param {Array}  args     Array of { type: 'i'|'f'|'s', value }
 */
function oscMessage(address, args = []) {
  const addrBuf = oscString(address);
  let typetag = ",";
  const argBufs = [];

  for (const arg of args) {
    typetag += arg.type;
    switch (arg.type) {
      case "i": argBufs.push(oscInt(arg.value)); break;
      case "f": argBufs.push(oscFloat(arg.value)); break;
      case "s": argBufs.push(oscString(arg.value)); break;
    }
  }

  const typetagBuf = oscString(typetag);
  return Buffer.concat([addrBuf, typetagBuf, ...argBufs]);
}

// ── OSC reply parsing ────────────────────────────────────────────────────

function readOscString(buf, offset) {
  const nullIdx = buf.indexOf(0, offset);
  const str = buf.toString("utf8", offset, nullIdx);
  const aligned = Math.ceil((nullIdx + 1) / 4) * 4;
  return { str, nextOffset: aligned };
}

function parseOscReplyJson(buf) {
  let offset = 0;
  const { nextOffset: o1 } = readOscString(buf, offset);
  offset = o1;
  const { str: typetag, nextOffset: o2 } = readOscString(buf, offset);
  offset = o2;
  for (let i = 1; i < typetag.length; i++) {
    const t = typetag[i];
    if (t === "s") {
      const { str } = readOscString(buf, offset);
      return JSON.parse(str);
    }
    if (t === "i" || t === "f") offset += 4;
  }
  return null;
}

// ── QLab OSC Client ──────────────────────────────────────────────────────

class QLab {
  constructor(host = "127.0.0.1", port = 53000) {
    this.host = host;
    this.port = port;
    this.socket = dgram.createSocket("udp4");
    this._bound = false;
  }

  // QLab sends all OSC replies to port 53001 by default, regardless of the
  // source port of the incoming packet. We must listen on 53001 to receive them.
  ensureBound() {
    if (this._bound) return Promise.resolve();
    if (this._bindingPromise) return this._bindingPromise;
    this._bindingPromise = new Promise((resolve, reject) => {
      this.socket.bind(53001, (err) => {
        if (err) return reject(err);
        this._bound = true;
        resolve();
      });
    });
    return this._bindingPromise;
  }

  send(address, args = []) {
    return new Promise((resolve, reject) => {
      const msg = oscMessage(address, args);
      this.socket.send(msg, 0, msg.length, this.port, this.host, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** Send a command and wait for QLab's JSON reply. Returns the `data` field. */
  async sendAndAwaitReply(address, args = [], timeoutMs = 2000) {
    await this.ensureBound();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.removeListener("message", onMsg);
        reject(new Error(`Timeout waiting for QLab reply to ${address}`));
      }, timeoutMs);

      const onMsg = (buf) => {
        try {
          const json = parseOscReplyJson(buf);
          if (!json || json.address !== address) return;
          clearTimeout(timer);
          this.socket.removeListener("message", onMsg);
          if (json.status === "ok") {
            resolve(json.data);
          } else {
            reject(new Error(`QLab error for ${address}: ${JSON.stringify(json)}`));
          }
        } catch (_) { /* ignore malformed packets */ }
      };

      this.socket.on("message", onMsg);
      this.send(address, args).catch((err) => {
        clearTimeout(timer);
        this.socket.removeListener("message", onMsg);
        reject(err);
      });
    });
  }

  close() {
    this.socket.close();
  }

  // ── QLab-specific helpers (all workspace-scoped) ─────────────────────

  async setCueProperty(wsId, property, value, valueType = "s") {
    await this.send(`/workspace/${wsId}/cue/selected/${property}`, [{ type: valueType, value }]);
  }

  async setCuePropertyById(wsId, cueId, property, value, valueType = "s") {
    await this.send(`/workspace/${wsId}/cue_id/${cueId}/${property}`, [{ type: valueType, value }]);
  }

  /**
   * Build a complete MIDI cue group from an array of { cc, value, label } objects.
   *
   * @param {Object}   settings   Global settings (workspaceId, midiPatch, midiChannel, etc.)
   * @param {Object[]} midiCues   Array of { cc, value, label }
   * @param {string}   groupName  Name for the group cue
   */
  async buildMidiCueGroup(settings, midiCues, groupName) {
    const delay = (ms) => new Promise(r => setTimeout(r, ms));
    const SETTLE = 80;
    const wsId = settings.workspaceId;

    if (!wsId) throw new Error("QLab workspace ID is not configured");

    // Bind to the reply port before any sends so QLab's replies land on our socket
    await this.ensureBound();

    // QLab 5 requires a connect handshake before it will execute workspace commands
    await this.send(`/workspace/${wsId}/connect`);
    await delay(SETTLE);

    // 1. Create the group cue and capture its unique ID from QLab's reply.
    //    We need the ID to create MIDI cues inside the group via /cueList/{group_id}/new.
    const groupData = await this.sendAndAwaitReply(
      `/workspace/${wsId}/new`, [{ type: "s", value: "group" }]
    );
    // QLab may return the UUID as a plain string or as { uniqueID: "..." }
    const groupId = (typeof groupData === "string") ? groupData : groupData.uniqueID;
    if (!groupId) throw new Error(`QLab did not return a group ID (got: ${JSON.stringify(groupData)})`);
    await delay(SETTLE);

    await this.setCuePropertyById(wsId, groupId, "name", groupName);
    await delay(SETTLE);

    // 2. Create MIDI cues inside the group. Use sendAndAwaitReply so we get
    //    each new cue's ID back from QLab, then set all properties by that ID
    //    instead of relying on "selected" state (which may point to the group).
    for (let i = 0; i < midiCues.length; i++) {
      const cue = midiCues[i];

      const midiData = await this.sendAndAwaitReply(
        `/workspace/${wsId}/new`, [{ type: "s", value: "midi" }]
      );
      const midiId = (typeof midiData === "string") ? midiData : midiData?.uniqueID;
      if (!midiId) throw new Error(`QLab did not return a cue ID for MIDI cue ${i} (got: ${JSON.stringify(midiData)})`);
      await delay(SETTLE);

      // Move the new cue into the group at position i
      await this.send(`/workspace/${wsId}/move/${midiId}`, [
        { type: "i", value: i },
        { type: "s", value: groupId },
      ]);
      await delay(SETTLE);

      await this.setCuePropertyById(wsId, midiId, "name", cue.label);
      await delay(SETTLE);

      // messageType 1 = MIDI Voice Message ("Musical MIDI")
      await this.setCuePropertyById(wsId, midiId, "messageType", 1, "i");
      await delay(SETTLE);

      // status 3 = Control Change
      await this.setCuePropertyById(wsId, midiId, "status", 3, "i");
      await delay(SETTLE);

      await this.setCuePropertyById(wsId, midiId, "channel", settings.midiChannel, "i");
      await delay(SETTLE);

      await this.setCuePropertyById(wsId, midiId, "patch", settings.midiPatch, "i");
      await delay(SETTLE);

      await this.setCuePropertyById(wsId, midiId, "byte1", cue.cc, "i");
      await delay(SETTLE);

      await this.setCuePropertyById(wsId, midiId, "byte2", cue.value, "i");
      await delay(SETTLE);

      const preWait = i * settings.preWaitInterval;
      if (preWait > 0) {
        await this.setCuePropertyById(wsId, midiId, "preWait", preWait, "f");
        await delay(SETTLE);
      }
    }

    // Set mode 3 (timeline) after all children are in place — QLab resets it on first child move
    await this.setCuePropertyById(wsId, groupId, "mode", 3, "i");
    await delay(SETTLE);

    return { success: true, cueCount: midiCues.length };
  }
}

module.exports = { QLab, oscMessage };

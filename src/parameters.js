/**
 * Moog 500 Series Analog Delay - Parameter Definitions
 *
 * Each parameter defines how user-facing values map to MIDI CC values.
 * Derived from the Moog MIDI implementation chart and the preset builder spreadsheet.
 */

// ── Lookup Tables ──────────────────────────────────────────────────────────

const BEAT_UNITS = {
  "Quarter": 1,
  "Dotted Quarter": 1.5,
  "8th": 0.5
};

const BEAT_DIVISIONS = {
  "Whole": 4,
  "Half": 2,
  "Quarter": 1,
  "Dotted 8th": 0.75,
  "8th": 0.5,
  "8th Triplet": 1 / 3,
  "16th": 0.25,
  "16th Triplet": 1 / 6,
  "32nd": 0.125
};

const TIME_SIGNATURES = {
  "4/4": { num: 4, denom: 4 },
  "3/4": { num: 3, denom: 4 },
  "2/4": { num: 2, denom: 4 },
  "5/4": { num: 5, denom: 4 },
  "7/4": { num: 7, denom: 4 },
  "6/8": { num: 6, denom: 8 },
  "7/8": { num: 7, denom: 8 },
  "9/8": { num: 9, denom: 8 },
  "12/8": { num: 12, denom: 8 }
};

const LFO_SHAPES = {
  "Off": 0,
  "Sine": 16,
  "Triangle": 32,
  "Square": 48,
  "Saw": 64,
  "Ramp": 80,
  "S&H": 96,
  "Smooth S&H": 112
};

const FILTER_MODES = {
  "Bright": 0,
  "Dark": 64
};

const TIME_RANGES = {
  "Short (0.5x)": 0,
  "Long (1.0x)": 64
};

const TIME_MULTIPLIERS = {
  "1x": 0,
  "2x": 32,
  "4x": 64,
  "8x": 96
};

const PITCH_BEND_AMOUNTS = {
  "Off": 0,
  "2 semitones": 16,
  "3 semitones": 32,
  "4 semitones": 48,
  "5 semitones": 64,
  "7 semitones": 80,
  "12 semitones (1 oct)": 96,
  "24 semitones (2 oct)": 112
};

const MIDI_NOTE_MODES = {
  "Off": 0,
  "Delay Time": 43
};

const ON_OFF = {
  "Off": 0,
  "On": 64
};

const TAP_POLARITY = {
  "Normally Closed": 0,
  "Normally Open": 64
};

const TAP_TEMPO_MULTIPLIER = {
  "1x": 0,
  "2x": 32,
  "3x": 64,
  "4x": 96
};

const TAP_SYNC_DEST = {
  "Time": 0,
  "LFO": 64
};

const CV_INPUT_MODES = {
  "Tap Tempo": 0,
  "CV → Time": 16,
  "CV → Feedback": 32,
  "CV → LFO Rate": 48,
  "CV → LFO Amount": 64,
  "CV → LFO Shape": 80
};

const TIME_LED_DIVIDERS = {
  "x1": 0,
  "x2": 16,
  "x3": 32,
  "x4": 48,
  "x5": 64,
  "x6": 80,
  "x7": 96,
  "x8": 112
};

const CLOCK_DIVISIONS = {
  "4 Whole": 0,
  "3 Whole": 6,
  "2 Whole": 12,
  "WH + 1/2 Dot": 18,
  "WH + 1/2": 24,
  "WH + 1/4": 30,
  "Whole": 35,
  "1/2 Dot": 41,
  "WH Triplet": 47,
  "1/2": 53,
  "1/4 Dot": 59,
  "1/2 Triplet": 64,
  "1/4": 70,
  "1/8 Dot": 76,
  "1/4 Triplet": 82,
  "1/8": 88,
  "1/16 Dot": 94,
  "1/8 Triplet": 99,
  "1/16": 105,
  "1/16 Triplet": 111,
  "1/32": 117,
  "1/32 Triplet": 123
};

// ── Parameter Type Definitions ─────────────────────────────────────────────

/**
 * Parameter type:
 * - "continuous_14bit": 0–16383, split across MSB/LSB CCs
 * - "continuous_7bit":  0–127, single CC
 * - "percent_7bit":     0–100% user-facing, maps to 0–127 CC
 * - "discrete":         dropdown/list of named options with fixed CC values
 * - "computed_delay":   special: BPM + Beat Unit + Beat Division → auto-calculates
 *                       Time MSB/LSB, Multiplier, Range, and Sync Off
 */

const PARAMETERS = {
  // ── Computed Delay Time (multi-CC output) ──────────────────────────────
  "Delay Time (BPM Sync)": {
    type: "computed_delay",
    label: "Delay Time",
    description: "Musical delay time calculated from BPM, time signature, beat unit, and beat division.",
    inputs: {
      timeSignature: { label: "Time Signature", options: TIME_SIGNATURES, default: "4/4" },
      bpm: { label: "BPM", min: 20, max: 300, default: 120, step: 1 },
      beatUnit: { label: "Beat Unit", options: BEAT_UNITS, default: "Quarter" },
      beatDivision: { label: "Beat Division", options: BEAT_DIVISIONS, default: "Quarter" }
    },
    compute(bpm, beatUnit, beatDivision, timeSignature = "4/4") {
      const beatUnitMult = BEAT_UNITS[beatUnit] || 1;
      const divMult = BEAT_DIVISIONS[beatDivision] || 1;
      const targetMs = Math.round((60000 / bpm) * beatUnitMult * divMult * 100) / 100;

      // Auto-select multiplier based on target delay range
      let multiplier, cc75val;
      if (targetMs <= 800) { multiplier = 1; cc75val = 0; }
      else if (targetMs <= 1600) { multiplier = 2; cc75val = 32; }
      else if (targetMs <= 3200) { multiplier = 4; cc75val = 64; }
      else { multiplier = 8; cc75val = 96; }

      const baseMs = targetMs / multiplier;
      const rangeMode = baseMs <= 400 ? "0.5x" : "1.0x";
      const cc74val = rangeMode === "0.5x" ? 0 : 64;

      // 14-bit value mapping
      let normalized;
      if (rangeMode === "0.5x") {
        normalized = Math.max(0, Math.min(1, (baseMs - 35) / (400 - 35)));
      } else {
        normalized = Math.max(0, Math.min(1, (baseMs - 70) / (800 - 70)));
      }
      const combined = Math.round(normalized * 16383);
      const msb = Math.floor(combined / 128);
      const lsb = combined % 128;

      const valid = targetMs <= 6400;

      return {
        valid,
        displayValue: `${targetMs}ms (${timeSignature} ${beatDivision})`,
        computed: {
          targetMs,
          selectedMultiplier: multiplier,
          cc75MultiplierValue: cc75val,
          basedDelayMs: baseMs,
          rangeMode,
          combined14bit: combined,
          cc12MSB: msb,
          cc44LSB: lsb,
          cc74Range: cc74val
        },
        cues: [
          { cc: 76, value: 0, label: "Sync OFF" },
          { cc: 74, value: cc74val, label: `Time Range: ${rangeMode}` },
          { cc: 75, value: cc75val, label: `Multiplier: ${multiplier}x` },
          { cc: 12, value: msb, label: `Delay Time MSB` },
          { cc: 44, value: lsb, label: `Delay Time LSB` }
        ]
      };
    }
  },

  // ── Delay Time (Manual ms) ─────────────────────────────────────────────
  "Delay Time (Manual)": {
    type: "continuous_ms",
    label: "Delay Time (ms)",
    description: "Set delay time directly in milliseconds (35–6400ms).",
    min: 35,
    max: 6400,
    default: 500,
    step: 1,
    encoderStep: 5,
    unit: "ms",
    compute(ms) {
      let multiplier, cc75val;
      if (ms <= 800) { multiplier = 1; cc75val = 0; }
      else if (ms <= 1600) { multiplier = 2; cc75val = 32; }
      else if (ms <= 3200) { multiplier = 4; cc75val = 64; }
      else { multiplier = 8; cc75val = 96; }

      const baseMs = ms / multiplier;
      const rangeMode = baseMs <= 400 ? "0.5x" : "1.0x";
      const cc74val = rangeMode === "0.5x" ? 0 : 64;

      let normalized;
      if (rangeMode === "0.5x") {
        normalized = Math.max(0, Math.min(1, (baseMs - 35) / (400 - 35)));
      } else {
        normalized = Math.max(0, Math.min(1, (baseMs - 70) / (800 - 70)));
      }
      const combined = Math.round(normalized * 16383);
      const msb = Math.floor(combined / 128);
      const lsb = combined % 128;

      return {
        valid: ms >= 35 && ms <= 6400,
        displayValue: `${ms}ms`,
        cues: [
          { cc: 76, value: 0, label: "Sync OFF" },
          { cc: 74, value: cc74val, label: `Time Range: ${rangeMode}` },
          { cc: 75, value: cc75val, label: `Multiplier: ${multiplier}x` },
          { cc: 12, value: msb, label: `Delay Time MSB` },
          { cc: 44, value: lsb, label: `Delay Time LSB` }
        ]
      };
    }
  },

  // ── Simple Continuous Parameters (percent → 7-bit) ─────────────────────
  "Feedback": {
    type: "percent_7bit",
    label: "Feedback",
    description: "Delay feedback amount (0–100%).",
    msbCC: 13,
    lsbCC: 45,
    default: 0,
    unit: "%"
  },

  "LFO Rate": {
    type: "percent_7bit",
    label: "LFO Rate",
    description: "LFO modulation rate (0–100%).",
    msbCC: 15,
    lsbCC: 47,
    default: 50,
    unit: "%"
  },

  "LFO Amount": {
    type: "percent_7bit",
    label: "LFO Amount",
    description: "LFO modulation depth (0–100%).",
    msbCC: 16,
    lsbCC: 48,
    default: 0,
    unit: "%"
  },

  "LFO Duty Cycle": {
    type: "percent_14bit",
    label: "LFO Duty Cycle",
    description: "LFO duty cycle (0–100%).",
    msbCC: 20,
    lsbCC: 52,
    default: 50,
    unit: "%"
  },

  "Time Slew Rate": {
    type: "percent_14bit",
    label: "Time Slew Rate",
    description: "Delay time slew/glide rate (0–100%).",
    msbCC: 5,
    lsbCC: 37,
    default: 0,
    unit: "%"
  },

  // ── Discrete Parameters ────────────────────────────────────────────────
  "LFO Shape": {
    type: "discrete",
    label: "LFO Shape",
    description: "LFO waveform shape.",
    cc: 17,
    options: LFO_SHAPES,
    default: "Off"
  },

  "Filter Mode": {
    type: "discrete",
    label: "Filter",
    description: "Delay filter brightness.",
    cc: 89,
    options: FILTER_MODES,
    default: "Bright"
  },

  "Time Range": {
    type: "discrete",
    label: "Time Range",
    description: "Short (0.5x max 400ms) or Long (1.0x max 800ms) base range.",
    cc: 74,
    options: TIME_RANGES,
    default: "Long (1.0x)"
  },

  "Time Multiplier": {
    type: "discrete",
    label: "Multiplier",
    description: "Multiply delay time by 1x, 2x, 4x, or 8x.",
    cc: 75,
    options: TIME_MULTIPLIERS,
    default: "1x"
  },

  "Time Sync On/Off": {
    type: "discrete",
    label: "Time Sync",
    description: "Sync delay time to MIDI clock.",
    cc: 76,
    options: ON_OFF,
    default: "Off"
  },

  "Time Clock Division": {
    type: "discrete",
    label: "Time Clock Div",
    description: "Clock division for synced delay time.",
    cc: 77,
    options: CLOCK_DIVISIONS,
    default: "1/4"
  },

  "LFO Sync On/Off": {
    type: "discrete",
    label: "LFO Sync",
    description: "Sync LFO rate to MIDI clock.",
    cc: 78,
    options: ON_OFF,
    default: "Off"
  },

  "LFO Clock Division": {
    type: "discrete",
    label: "LFO Clock Div",
    description: "Clock division for synced LFO rate.",
    cc: 79,
    options: CLOCK_DIVISIONS,
    default: "1/4"
  },

  "Pitch Bend Amount": {
    type: "discrete",
    label: "Pitch Bend",
    description: "Pitch bend range in semitones.",
    cc: 80,
    options: PITCH_BEND_AMOUNTS,
    default: "Off"
  },

  "MIDI Note Mode": {
    type: "discrete",
    label: "MIDI Note Mode",
    description: "Control delay time from MIDI note messages.",
    cc: 82,
    options: MIDI_NOTE_MODES,
    default: "Off"
  },

  "Mod Wheel → LFO": {
    type: "discrete",
    label: "Mod Wheel → LFO",
    description: "Route mod wheel to LFO amount.",
    cc: 85,
    options: ON_OFF,
    default: "Off"
  },

  "Tap Tempo Multiplier": {
    type: "discrete",
    label: "Tap Multiplier",
    description: "Multiply tapped tempo.",
    cc: 86,
    options: TAP_TEMPO_MULTIPLIER,
    default: "1x"
  },

  "Tap/Sync Destination": {
    type: "discrete",
    label: "Tap/Sync Dest",
    description: "Route tap tempo to delay time or LFO rate.",
    cc: 87,
    options: TAP_SYNC_DEST,
    default: "Time"
  },

  "CV Input Mode": {
    type: "discrete",
    label: "CV Input Mode",
    description: "Function of the rear CV input jack.",
    cc: 90,
    options: CV_INPUT_MODES,
    default: "Tap Tempo"
  },

  "Tap Switch Polarity": {
    type: "discrete",
    label: "Tap Polarity",
    description: "Tap switch normally open or closed.",
    cc: 114,
    options: TAP_POLARITY,
    default: "Normally Closed"
  },

  "Time LED Divider": {
    type: "discrete",
    label: "Time LED Div",
    description: "LED flash rate divider.",
    cc: 116,
    options: TIME_LED_DIVIDERS,
    default: "x1"
  },

  "LFO MIDI Note Reset": {
    type: "discrete",
    label: "LFO Note Reset",
    description: "Reset LFO phase on MIDI note.",
    cc: 73,
    options: ON_OFF,
    default: "Off"
  }
};

// ── Helper: convert a percent_7bit parameter value to MIDI cues ──────────

function percentTo7BitCues(paramDef, percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  const msbVal = Math.floor((clamped / 100) * 127);
  const cues = [
    { cc: paramDef.msbCC, value: msbVal, label: `${paramDef.label} MSB` }
  ];
  if (paramDef.lsbCC !== undefined) {
    cues.push({ cc: paramDef.lsbCC, value: 0, label: `${paramDef.label} LSB` });
  }
  return {
    valid: true,
    displayValue: `${clamped}%`,
    cues
  };
}

// ── Helper: convert a percent_14bit parameter value to MIDI cues ─────────

function percentTo14BitCues(paramDef, percent) {
  const clamped = Math.max(0, Math.min(100, percent));
  const combined = Math.round((clamped / 100) * 16383);
  const msb = Math.floor(combined / 128);
  const lsb = combined % 128;
  return {
    valid: true,
    displayValue: `${clamped}%`,
    cues: [
      { cc: paramDef.msbCC, value: msb, label: `${paramDef.label} MSB` },
      { cc: paramDef.lsbCC, value: lsb, label: `${paramDef.label} LSB` }
    ]
  };
}

// ── Helper: convert a discrete parameter value to MIDI cues ──────────────

function discreteToCues(paramDef, selectedKey) {
  const value = paramDef.options[selectedKey];
  if (value === undefined) return { valid: false, displayValue: "ERR", cues: [] };
  return {
    valid: true,
    displayValue: selectedKey,
    cues: [
      { cc: paramDef.cc, value, label: `${paramDef.label}: ${selectedKey}` }
    ]
  };
}

// ── Master resolver: given a parameter name and user value, return cues ──

function resolveParameter(paramName, userValue) {
  const def = PARAMETERS[paramName];
  if (!def) return { valid: false, displayValue: "Unknown", cues: [] };

  switch (def.type) {
    case "computed_delay":
      return def.compute(userValue.bpm, userValue.beatUnit, userValue.beatDivision, userValue.timeSignature);

    case "continuous_ms":
      return def.compute(userValue);

    case "percent_7bit":
      return percentTo7BitCues(def, userValue);

    case "percent_14bit":
      return percentTo14BitCues(def, userValue);

    case "discrete":
      return discreteToCues(def, userValue);

    default:
      return { valid: false, displayValue: "ERR", cues: [] };
  }
}

// ── Interaction type classifier ────────────────────────────────────────────
//
// "boolean"    On/Off 2-option discrete → toggle + ● ○ indicator, no encoder
// "binary"     Any other 2-option discrete → toggle, no encoder
// "list"       Multi-option discrete → encoder cycles, keypad shows list dialog
// "continuous" Percentage or ms value → encoder adjusts, keypad shows text dialog
// "computed"   BPM-sync delay → encoder adjusts BPM, keypad shows multi-step dialog

function getInteractionType(paramName) {
  const def = PARAMETERS[paramName];
  if (!def) return null;
  if (def.type === "computed_delay") return "computed";
  if (def.type !== "discrete") return "continuous";
  const keys = Object.keys(def.options);
  if (keys.length === 2) {
    return (keys[0] === "Off" && keys[1] === "On") ? "boolean" : "binary";
  }
  return "list";
}

module.exports = { PARAMETERS, TIME_SIGNATURES, resolveParameter, getInteractionType };

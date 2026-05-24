/**
 * Factory reset defaults and expected MIDI output.
 * Pure constants — no MIDI or Stream Deck dependencies, safe to import in tests.
 */

const FACTORY_DEFAULTS = {
  "Delay Time (BPM Sync)": { timeSignature: "4/4", bpm: 120, beatUnit: "Quarter", beatDivision: "Quarter" },
  "Feedback":         0,
  "LFO Shape":        "Off",
  "LFO Rate":         20,
  "LFO Amount":       10,
  "Filter Mode":      "Bright",
  "Time Sync On/Off": "Off"
};

// Expected MIDI output for the above defaults.
// Note: "Filter CC9" in the original spec is a typo — Filter Mode uses CC89.
const EXPECTED_RESET_CUES = [
  { cc: 76, value:  0, label: "Sync OFF" },
  { cc: 74, value: 64, label: "Time Range (1.0x)" },
  { cc: 75, value:  0, label: "Delay Multiplier (1x)" },
  { cc: 12, value: 75, label: "Delay Time MSB" },
  { cc: 44, value: 50, label: "Delay Time LSB" },
  { cc: 13, value:  0, label: "Feedback MSB" },
  { cc: 45, value:  0, label: "Feedback LSB" },
  { cc: 17, value:  0, label: "LFO Shape (Off)" },
  { cc: 15, value: 25, label: "LFO Rate MSB" },
  { cc: 47, value:  0, label: "LFO Rate LSB" },
  { cc: 16, value: 12, label: "LFO Amount MSB" },
  { cc: 48, value:  0, label: "LFO Amount LSB" },
  { cc: 89, value:  0, label: "Filter (Bright)" }
];

function verifyResetCues(actualCues) {
  const actualMap = new Map(actualCues.map(c => [c.cc, c.value]));
  let allPass = true;
  const lines = [];

  for (const exp of EXPECTED_RESET_CUES) {
    const actual = actualMap.get(exp.cc);
    const pass = actual === exp.value;
    if (!pass) allPass = false;
    lines.push(`  ${pass ? "PASS" : "FAIL"} CC${exp.cc} ${exp.label}: expected ${exp.value}, got ${actual ?? "missing"}`);
  }

  return { allPass, lines };
}

module.exports = { FACTORY_DEFAULTS, EXPECTED_RESET_CUES, verifyResetCues };

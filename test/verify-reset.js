/**
 * Standalone test: verifies that the factory reset defaults produce
 * the expected MIDI CC values.
 *
 * Run with: node test/verify-reset.js
 */

const { resolveParameter } = require("../src/parameters");
const { FACTORY_DEFAULTS, EXPECTED_RESET_CUES, verifyResetCues } = require("../src/reset-defaults");

// Compute actual cues from factory defaults
const actualCues = [];
for (const [paramName, defaultValue] of Object.entries(FACTORY_DEFAULTS)) {
  const result = resolveParameter(paramName, defaultValue);
  if (!result.valid) {
    process.stderr.write(`INVALID result for "${paramName}"\n`);
    process.exitCode = 1;
    return;
  }
  actualCues.push(...result.cues);
}

// Verify against expected
const { allPass, lines } = verifyResetCues(actualCues);

process.stdout.write("─── Moog 500 Reset Verification ───────────────────────────\n");
for (const line of lines) process.stdout.write(line + "\n");
process.stdout.write("───────────────────────────────────────────────────────────\n");

// Print the computed delay breakdown
const delayResult = resolveParameter("Delay Time (BPM Sync)", FACTORY_DEFAULTS["Delay Time (BPM Sync)"]);
process.stdout.write("\nComputed delay values:\n");
process.stdout.write(JSON.stringify(delayResult.computed, null, 2) + "\n");

if (allPass) {
  process.stdout.write("\n✓ All CC values match expected. Calculations are correct.\n\n");
  process.exitCode = 0;
} else {
  process.stderr.write("\n✗ One or more CC values differ from expected.\n\n");
  process.exitCode = 1;
}

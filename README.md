# Moog 500 Series Analog Delay — Stream Deck Preset Builder

A Stream Deck plugin that lets you build MIDI presets for the Moog 500 Series Analog Delay and commit them to QLab as ready-to-fire cue groups.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  STREAM DECK                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ Delay   │ │Feedback │ │LFO Shape│ │ COMMIT  │       │
│  │ 500ms   │ │  45%    │ │  Sine   │ │ 4 params│       │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘       │
│       │            │           │            │            │
│  Stream Deck + encoder devices:                          │
│  Dial rotate = adjust value                              │
│  Dial press  = reset to default                          │
│  Touch tap   = open input dialog                         │
└───────┼────────────┼───────────┼────────────┼────────────┘
        │            │           │            │
        ▼            ▼           ▼            │
  ┌─────────────────────────────────────┐     │
  │  macOS `defaults` persistent store  │     │
  │  Domain: com.moog500.presetbuilder  │     │
  │                                     │     │
  │  param.Feedback = {value:45, ...}   │     │
  │  param.LFO Shape = {value:"Sine"}  │     │
  │  param.Delay Time = {value:500}     │     │
  │  global.qlabHost = "127.0.0.1"     │     │
  │  global.midiChannel = 1            │     │
  └───────────────────┬─────────────────┘     │
                      │                       │
                      │    ◄──── reads ───────┘
                      ▼
  ┌─────────────────────────────────────┐
  │  Parameter Resolver                 │
  │  Converts user values → MIDI CCs   │
  │                                     │
  │  "Feedback 45%" → CC13=57, CC45=0  │
  │  "500ms" → CC76=0, CC74=64,       │
  │            CC75=0, CC12=75, CC44=50│
  └───────────────────┬─────────────────┘
                      │
                      ▼ OSC over UDP
  ┌─────────────────────────────────────┐
  │  QLab (port 53000)                  │
  │                                     │
  │  Created cue group:                 │
  │  ┌─ "Moog 500 Preset" (Timeline) ─┐│
  │  │  CC76=0   Sync OFF    pre: 0.0s ││
  │  │  CC74=64  Range 1.0x  pre: 0.1s ││
  │  │  CC75=0   Mult 1x    pre: 0.2s ││
  │  │  CC12=75  Time MSB   pre: 0.3s ││
  │  │  CC44=50  Time LSB   pre: 0.4s ││
  │  │  CC13=57  Fdbk MSB   pre: 0.5s ││
  │  │  CC17=16  LFO Sine   pre: 0.6s ││
  │  └─────────────────────────────────┘│
  └─────────────────────────────────────┘
```

---

## Requirements

- **macOS** 10.15 or later
- **Stream Deck** software 6.6 or later
- **Node.js** 20 or later (for building; Stream Deck bundles its own runtime)
- **QLab** 4 or 5 (with OSC access enabled on port 53000)
- **Stream Deck CLI**: `npm install -g @elgato/cli`

---

## Installation

### 1. Clone / Download

Place this folder wherever you keep projects.

### 2. Install Dependencies

```bash
cd /path/to/this/project
npm install
```

### 3. Build

```bash
npm run build
```

This bundles `src/` into `com.moog500.presetbuilder.sdPlugin/bin/plugin.js`.

### 4. Link to Stream Deck

```bash
streamdeck link com.moog500.presetbuilder.sdPlugin
```

### 5. Restart Stream Deck

The plugin should now appear under the **Moog 500 Delay** category in the Stream Deck action list.

### Development Mode

```bash
npm run watch
```

This rebuilds on file changes and auto-restarts the plugin.

---

## Workflow Overview

### The Two-Stage Approach

**Stage 1: Real-Time MIDI Control**
- Each parameter button has its **Set Parameter** action assigned
- When you press a button (or rotate an encoder), the plugin immediately:
  1. Prompts you for a value (dialog, dropdown, or dial input)
  2. Sends MIDI CC messages directly to your configured MIDI device
  3. Stores the value persistently
- **Result:** You hear/see the change on the Moog 500 in real-time ✓

**Stage 2: QLab Cue Creation**
- Once you've dialed in a sound you like, press the **Commit to QLab** button
- The plugin reads all stored parameter values and creates a QLab cue group
- You'll be prompted for a meaningful cue name (with a default sequential suggestion like "Preset 001")
- **Result:** A new QLab cue ready to fire with this exact preset ✓

### Typical Session

```
1. Press "Delay Time" button → enter 500ms → MIDI sent to Moog, stored
2. Press "Feedback" button  → enter 45%  → MIDI sent to Moog, stored
3. Press "LFO Shape" button → select Sine → MIDI sent to Moog, stored
   (You hear all these changes in real-time on the Moog 500)
4. Press "COMMIT" button → name it "Synth Pad" → QLab cue created
5. Later, press the "COMMIT" button again → name it "Delay Effect" → another QLab cue
```

Each preset is independent in QLab. You can build multiple presets in a single session.

### Parameter Filters

The Commit button's Property Inspector includes a **Parameter Filters** checklist. Each of the 24 parameters has a checkbox — all enabled by default.

When a parameter is **deselected**:
- It is **excluded from the QLab cue group** when you press Commit
- Its parameter button is **silenced** — adjusting it stores the value but does not send MIDI CCs to the hardware

This lets you scope a commit to only the parameters you care about for a given preset (for example, committing only delay time and feedback while ignoring LFO settings), or mute specific parameters during live adjustment without removing their buttons from the deck.

Use **Select All** / **Deselect All** at the top of the list to quickly reset the filter.

---

## Usage

### Adding a Parameter Button

1. In the Stream Deck app, find **Moog 500 Delay** in the action list
2. Drag **"Set Parameter"** onto a button (or encoder dial on Stream Deck +)
3. In the Property Inspector (right panel), select the parameter from the dropdown
4. The button is now ready

### Setting Values

**On a standard button (Keypad):**
- Press the button → a native macOS dialog appears
- For continuous parameters: enter a number (e.g., `45` for 45% feedback)
- For discrete parameters: pick from a list (e.g., "Sine" for LFO Shape)
- For BPM Sync delay: you'll be prompted for BPM, beat unit, then beat division

**On a Stream Deck + encoder (dial):**
- **Rotate** the dial to adjust the value (fine adjustment when pressed)
- **Press** the dial to reset to the parameter's default value
- **Touch** the display strip to open the input dialog

The button displays the current stored value at all times.

**✓ MIDI CC messages are sent immediately to your configured MIDI device** as you adjust each parameter. This lets you hear changes in real-time on the Moog 500.

### Committing to QLab

1. Drag the **"Commit to QLab"** action onto a button
2. Configure QLab connection and MIDI settings in the Property Inspector:
   - **MIDI Output Device**: select your MIDI interface (configure once, used for all parameter buttons)
   - **MIDI Channel**: match the Moog 500's MIDI channel (default 1)
   - **QLab Host**: `127.0.0.1` for local, or the IP of a remote Mac
   - **OSC Port**: `53000` (default)
   - **MIDI Patch in QLab**: which QLab MIDI patch routes to your Moog 500 (1–8)
   - **Pre-Wait Interval**: time between each CC message (default 0.1s)
   - **Target Cue List**: (optional) if set, created cues go here
   - **Parameter Filters**: checkboxes for each parameter — deselected parameters are excluded from the QLab commit and suppressed from real-time MIDI output
3. Press the Commit button
4. You'll be prompted to name the preset cue with a default sequential name (e.g., "Preset 001")
5. Edit or confirm the name
6. The plugin creates a Timeline Group cue in QLab containing one MIDI cue per CC, each with a cumulative pre-wait

**Note:** The Commit button only sends to QLab and creates cues. MIDI was already sent to your device in real-time as you adjusted each parameter.

### QLab Setup

Ensure QLab is configured to accept OSC:
1. Open **Workspace Settings** → **Network** → **OSC Access**
2. Verify port 53000 is active (or set your custom port)
3. If using a passcode, note that this plugin doesn't currently support passcode auth
4. Ensure your MIDI patch is routed to the interface connected to the Moog 500

---

## Parameters Reference

### Computed (Multi-CC Output)
| Parameter | Description | Output CCs |
|-----------|-------------|------------|
| Delay Time (BPM Sync) | Musical delay from BPM + beat division | CC76, CC74, CC75, CC12, CC44 |
| Delay Time (Manual) | Direct ms entry (35–6400) | CC76, CC74, CC75, CC12, CC44 |

### Continuous (Percentage)
| Parameter | CC MSB | CC LSB | Resolution |
|-----------|--------|--------|------------|
| Feedback | 13 | 45 | 7-bit (MSB only) |
| LFO Rate | 15 | 47 | 7-bit (MSB only) |
| LFO Amount | 16 | 48 | 7-bit (MSB only) |
| LFO Duty Cycle | 20 | 52 | 14-bit |
| Time Slew Rate | 5 | 37 | 14-bit |

### Discrete (Selection)
| Parameter | CC | Options |
|-----------|-----|---------|
| LFO Shape | 17 | Off, Sine, Triangle, Square, Saw, Ramp, S&H, Smooth S&H |
| Filter Mode | 89 | Bright, Dark |
| Time Range | 74 | Short (0.5x), Long (1.0x) |
| Time Multiplier | 75 | 1x, 2x, 4x, 8x |
| Time Sync | 76 | Off, On |
| Time Clock Div | 77 | 4 Whole through 1/32 Triplet |
| LFO Sync | 78 | Off, On |
| LFO Clock Div | 79 | 4 Whole through 1/32 Triplet |
| Pitch Bend Amt | 80 | Off, 2–24 semitones |
| MIDI Note Mode | 82 | Off, Delay Time |
| Mod Wheel→LFO | 85 | Off, On |
| Tap Multiplier | 86 | 1x, 2x, 3x, 4x |
| Tap/Sync Dest | 87 | Time, LFO |
| CV Input Mode | 90 | Tap, Time, Feedback, LFO Rate, LFO Amt, LFO Shape |
| Tap Polarity | 114 | Normally Closed, Normally Open |
| Time LED Div | 116 | x1 through x8 |
| LFO Note Reset | 73 | Off, On |

---

## Persistent Storage

All values are stored in macOS `defaults` under the domain `com.moog500.presetbuilder`.

You can inspect stored values from Terminal:
```bash
# View all stored data
defaults read com.moog500.presetbuilder

# View a specific parameter
defaults read com.moog500.presetbuilder "param.Feedback"

# Clear everything
defaults delete com.moog500.presetbuilder
```

---

## File Structure

```
.
├── com.moog500.presetbuilder.sdPlugin/   # Plugin bundle (deployed to Stream Deck)
│   ├── manifest.json                      # Plugin metadata & action definitions
│   ├── bin/
│   │   └── plugin.js                      # Bundled plugin code (built by rollup)
│   ├── layouts/
│   │   └── parameter-layout.json          # Encoder touch-strip layout
│   ├── static/imgs/                       # Icons
│   │   ├── plugin/
│   │   ├── actions/parameter/
│   │   └── actions/commit/
│   └── ui/
│       ├── set-parameter.html             # Property Inspector for parameter action
│       └── commit.html                    # Property Inspector for commit action
├── src/                                   # Source code
│   ├── plugin.js                          # Entry point
│   ├── parameters.js                      # All parameter definitions & calculations
│   ├── defaults-store.js                  # macOS `defaults` persistence layer
│   ├── qlab-osc.js                        # OSC client for QLab communication
│   └── actions/
│       ├── set-parameter.js               # Set Parameter action handler
│       └── commit.js                      # Commit to QLab action handler
├── package.json
├── rollup.config.mjs
└── README.md
```

---

## Delay Time Calculation Logic

The delay time computation mirrors the spreadsheet logic:

1. **Target ms** = `(60000 / BPM) × beatUnitMultiplier × beatDivisionMultiplier`
2. **Auto-select multiplier**: ≤800ms→1x, ≤1600ms→2x, ≤3200ms→4x, else→8x
3. **Base ms** = targetMs / multiplier
4. **Range mode**: base ≤400ms → Short (0.5x), else → Long (1.0x)
5. **14-bit normalization**:
   - Short: `(base - 35) / (400 - 35)` → 0–16383
   - Long: `(base - 70) / (800 - 70)` → 0–16383
6. **Split**: MSB = floor(value / 128), LSB = value % 128

Maximum achievable delay: 800ms × 8x = 6400ms.

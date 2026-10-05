# Math to Sound

Type a mathematical function, see its graph, and hear it — two different ways.

**Pitch** (the default) reads f(x) as a pitch that rises and falls as the curve does, so you hear the
function as a melody. `x` is an even rising glissando, `x^2` falls to its vertex and climbs back out,
`sin(x)` is a wobbling siren, `1/x` plunges and then levels off.

**Timbre** plays the curve itself as one cycle of a looping waveform, so the shape on screen is the shape
of the wave reaching your ears. Here every function sounds at the *same* pitch and only the tone colour
changes: `sin(x)` is a pure tone, `x` is a sawtooth, `abs(x)` is a triangle, `sign(sin(x))` is a square.

Built with Vite, React and TypeScript. No backend, and no runtime dependencies beyond React itself.

## Running it

Requires [Node.js](https://nodejs.org) 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Then open the URL it prints (usually <http://localhost:5173>).

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Type-check, then build to `dist/` |
| `npm run preview` | Serve the built output locally |
| `npm test` | Run the parser and wavetable tests |
| `npm run typecheck` | Type-check without building |

## How the sound works

Both modes start the same way: the function is sampled at 2048 evenly spaced points across the half-open
domain `[xMin, xMax)`. Non-finite results (`1/0`, `tan(pi/2)`, `log` of a negative) are recorded as `NaN`.
The interval is half-open so that looping a cycle end-to-start doesn't duplicate a sample.

The graph and the audio read from **the same sampled array**, so the relationship between what you see and
what you hear is exact rather than approximate.

### Pitch mode

The function's robust range — the same outlier-resistant range the graph's y-axis uses, so one asymptote
spike can't dominate — is stretched across `±octaves` either side of the centre pitch. The midpoint of the
range sounds at the centre pitch. That curve of frequencies is handed to an oscillator through
`setValueCurveAtTime`.

The mapping is **exponential**, not linear, because pitch is perceived logarithmically: a straight line
only sounds like an even rise if each equal step in f(x) is an equal *ratio* in frequency. Map it linearly
and the low end sounds bunched up. This is why `f(x) = x` comes out as 69 → 123 → 220 → 393 → 702 Hz — each
quarter is roughly the same musical interval, not the same number of hertz.

Non-finite samples hold the previous frequency rather than jumping, so an asymptote doesn't click.

### Timbre mode

1. **Clean up.** Non-finite samples become silence. The mean is subtracted so the wave is centred on zero.
   A spike beside an asymptote is clamped to a robust peak, so one enormous value can't normalise
   everything else down to inaudibility.
2. **Normalise.** The cycle is scaled to a peak of exactly 1, which is why the volume slider — and not the
   function's own scale — decides how loud it is.
3. **Play.** The cycle goes into a one-cycle `AudioBuffer` played by a looping `AudioBufferSourceNode`. To
   make an N-sample buffer repeat at `f` hertz, its `playbackRate` is set to `f * N / sampleRate`.

One deliberate choice: the jump between the end of a cycle and its start is left in place. It isn't a bug —
`f(x) = x` on `[-1, 1)` really does leap from −1 to +1, and that leap is exactly what makes a sawtooth
sound like a sawtooth.

Note that in this mode `sin(x)` and `sin(x) + cos(x)` sound **identical**. That is correct: they are the
same wave shifted in phase, and phase alone is inaudible.

Both modes get a 15 ms fade in and a 30 ms fade out, to keep the start and stop from clicking.

There is no Fourier analysis anywhere in this project.

## Writing functions

- **Variable:** `x` only.
- **Operators:** `+ - * / ^` (and `**` as an alias for `^`).
- **Implicit multiplication:** `2x`, `3sin(x)`, `2(x+1)`, `(x+1)(x-1)`.
- **Constants:** `pi`, `e`, `tau`.
- **Functions:** `sin cos tan asin acos atan sinh cosh tanh exp ln log log10 log2 sqrt cbrt abs sign floor
  ceil round` and the two-argument `min max pow atan2 mod`.
- Names are case-insensitive, so `SIN(X)` works.
- `log` is the natural logarithm (same as `ln`). Use `log10` for base ten.

Precedence follows ordinary maths: `-x^2` is `-(x^2)`, and `2^3^2` is `2^(3^2)` = 512.

Expressions are parsed by a small hand-written recursive-descent parser in
[`src/lib/parser.ts`](src/lib/parser.ts) — there is no `eval` and no `new Function`.

## The settings

| Setting | Why it matters |
| --- | --- |
| **Pitch / Timbre** | Which mapping you listen through. |
| **Domain** (`x from … to …`) | In pitch mode, the stretch of the function you travel along. In timbre mode it *is* the cycle, so it decides the waveform's shape. |
| **Centre pitch** | 55–880 Hz. In pitch mode the middle of the sweep; in timbre mode the note itself. |
| **Pitch range** | Pitch mode only. How many octaves the function's range is spread across, ±0.5 to ±4. |
| **Duration** | How long the note is held. |
| **Volume** | Master level. Adjustable while a note is sounding. |

Volume can always be changed mid-note, and so can the pitch in timbre mode. A sweep's frequency is an
already-scheduled curve, so re-centring it there applies on the next play. Changing the function, the
domain or the mode is a different sound, so playback stops and waits for you to press play again.

## Project layout

```
src/
├── App.tsx                    state, and the wiring between pieces
├── lib/
│   ├── parser.ts              text -> (x) => number
│   ├── sampling.ts            the shared f(x) sampling used by graph AND audio
│   ├── audio.ts               wavetable construction
│   └── parser.test.ts         parser + wavetable tests
├── hooks/
│   └── useAudioPlayer.ts      Web Audio graph, play/pause/stop state machine
└── components/
    ├── FunctionInput.tsx      the expression box and its error display
    ├── Presets.tsx            example functions, each with its own domain
    ├── Graph.tsx              hand-drawn canvas plot
    ├── Controls.tsx           play / pause / stop
    └── Settings.tsx           domain, pitch, duration, volume
```

## Ideas for later

The sound mappings are isolated in `src/lib/audio.ts`, so adding another is a contained change:

- **Direct samples** — read `f(x)` straight into audio samples across the duration, so the domain's width
  sets the pitch.
- A playhead on the graph tracking the note as it sweeps, so you can see where in the curve you are.
- Export the result as a `.wav`, plot several functions at once, or add a harmonic breakdown.

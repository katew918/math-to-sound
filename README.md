# Math to Sound

Type a mathematical function, see its graph, and hear it.

The curve you draw becomes **one cycle of a waveform**, looped at a pitch you choose — so the shape on
screen is the shape of the wave reaching your ears. `sin(x)` is a pure tone. `x` is a sawtooth. `abs(x)`
is a triangle wave. `sign(sin(x))` is a square wave.

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

1. **Evaluate.** The function is sampled at 2048 evenly spaced points across the half-open domain
   `[xMin, xMax)`. The interval is half-open so that looping the cycle end-to-start doesn't duplicate a
   sample and put a kink in every waveform.
2. **Clean up.** Non-finite results (`1/0`, `tan(pi/2)`, `log` of a negative) become silence. The mean is
   subtracted so the wave is centred on zero. A spike beside an asymptote is clamped to a robust peak, so
   one enormous value can't normalise everything else down to inaudibility.
3. **Normalise.** The cycle is scaled to a peak of exactly 1, which is why the volume slider — and not the
   function's own scale — decides how loud it is.
4. **Play.** The cycle goes into a one-cycle `AudioBuffer` played by a looping `AudioBufferSourceNode`. To
   make an N-sample buffer repeat at `f` hertz, its `playbackRate` is set to `f * N / sampleRate`. A 15 ms
   fade in and 30 ms fade out keep the start and stop from clicking.

The graph and the audio read from **the same sampled array**, so the relationship between what you see and
what you hear is exact rather than approximate.

One deliberate choice: the jump between the end of a cycle and its start is left in place. It isn't a bug —
`f(x) = x` on `[-1, 1)` really does leap from −1 to +1, and that leap is exactly what makes a sawtooth
sound like a sawtooth.

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
| **Domain** (`x from … to …`) | The most interesting control. This span *is* the cycle, so it decides the waveform's shape and therefore the timbre. |
| **Pitch** | How fast the cycle repeats, 55–880 Hz. Changes the note, not the timbre. |
| **Duration** | How long the note is held. |
| **Volume** | Master level. Adjustable while a note is sounding. |

Pitch and volume can be changed mid-note. Changing the function or the domain is a different wave, so
playback stops and waits for you to press play again.

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

The sound mapping is isolated in `src/lib/audio.ts`, so alternative mappings are a contained change:

- **Pitch sweep** — let `f(x)` drive an oscillator's frequency over time, so you hear the function as a
  melody rather than a timbre.
- **Direct samples** — read `f(x)` straight into audio samples across the duration, so the domain's width
  sets the pitch.
- Export the result as a `.wav`, plot several functions at once, or add a harmonic breakdown.

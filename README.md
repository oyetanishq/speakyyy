# pdf-speak

A personal web app that reads PDFs aloud. While it speaks, the current sentence and word are highlighted on the page.

- **Read aloud (Mode 1):**
  - Uses a natural-sounding neural voice, [Phonon](https://www.npmjs.com/package/phonon-tts), which runs entirely in the browser: no server and no API key.
  - Comes with 38 English voices. The default is Russell (male, en-US).
  - Shows a soft highlight on the current sentence and a stronger one on the current word, and the page scrolls to keep up.
  - Click any word to start reading from there.
  - Speed and voice picker.
  - Reopens the last PDF at the spot where you stopped (stored in IndexedDB).
- **Explain (Mode 2, coming):** the LLM explains each section in simpler words, then that version is spoken.
- **LLM settings:** base URL, model and API key for any OpenAI-compatible API, saved in `localStorage`.

| Key | Action |
|---|---|
| <kbd>Space</kbd> | Play / pause |
| <kbd>←</kbd> / <kbd>→</kbd> | Previous / next sentence |
| <kbd>[</kbd> / <kbd>]</kbd> | Slower / faster |

## Develop

```sh
cd apps/web
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # tsc -b && vite build -> dist/
pnpm lint       # oxlint
```

Needs Node ≥ 22.13 and pnpm.

## Deploy

**Vercel:**
- Import the repo and set **Root Directory** to `apps/web`.
- `vercel.json` already handles the SPA rewrite and long-term caching of hashed assets.

**Under a sub-path:** build with `BASE_PATH=/sub/ pnpm build`.

**Cross-origin isolation headers:** the page is served with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. The Vite dev and preview servers send them, and so does `vercel.json`.
- These headers let Phonon generate speech on 3 threads.
- Without them it falls back to a single thread, which works but is slower.
- Anything loaded from another origin must allow CORS. The Hugging Face model files do.

The API key is stored in plain text in `localStorage`. That's fine for personal use, but don't host this somewhere other people sign in.

## How it works

```
apps/web/src
├─ lib/pdf/load.ts          the only pdfjs-dist import (worker + asset URLs)
├─ lib/pdf/text-model.ts    PDF text -> sentences -> words, each word pointing at
│                           exact characters of pdf.js text items
├─ lib/speech/narrator.ts   sentence queue, play/pause/seek
├─ lib/speech/phonon.ts     neural TTS: model download, voice catalog, synth + prefetch queue
├─ lib/speech/align.ts      word timings from the generated audio (Phonon gives none)
├─ lib/storage/*            localStorage settings, IndexedDB PDF + position
├─ lib/llm/client.ts        OpenAI-compatible client (connection test for now)
├─ components/viewer/*      lazy page canvases, pdf.js TextLayer, highlight overlay
├─ components/player/*      play/pause/skip, speed, voice
└─ hooks/*                  reader lifecycle, shortcuts, store bindings
```

### Text model (`text-model.ts`)
- Each page's text items are joined into one stream. For each character, the model remembers which page, item and offset it came from.
- `Intl.Segmenter` splits the stream into sentences and words.
- A sentence that crosses a page break stays whole.
- Words hyphenated across a line break ("exam-" + "ple") are rejoined.
- A heading (a new line in a different font size) is read as its own sentence.
- Sentences longer than about 220 characters are split, preferring commas. This avoids Chrome dropping utterances that run past about 15 s.

### Highlighting (`highlight-layer.tsx`)
- The pdf.js TextLayer creates one transparent `<span>` per text item, with the same index and string as the model.
- A word's box is measured with a DOM `Range` over those spans. This stays exact at any zoom level.

### Narrator and voice
- **Narrator (`narrator.ts`):** speaks one utterance per sentence through Phonon.
- **Phonon (`phonon.ts`):**
  - The Phonon 31m English model (about 65 MB, Apache-2.0) downloads on first use and is kept in the browser's Cache API. After that it loads in under a second.
  - Each sentence is generated whole, and the next two are prefetched. On a laptop CPU it generates about 13× faster than realtime, so there's no gap between sentences.
  - Playback goes through an `<audio>` element. Speed changes apply instantly with pitch preserved, and pause is a real pause.
  - After a seek, queued generation the reader no longer needs is cancelled.
- **Word timings for Phonon (`align.ts`):**
  - Phonon outputs audio only, with no word timings.
  - The aligner uses the audio's energy to find where speech starts and ends and where the pauses fall. It pins pauses longer than 0.2 s to the matching `, ; : .` in the text, then spreads the words in between by letter count.
  - On test sentences, every punctuation pause landed on the right word.
- **If the model can't load** (offline on first use, or a browser without WebAssembly SIMD), the player shows the error with a Retry button.

### Mode 2 hook
The narrator speaks whatever a `Script` returns for each sentence. `readAloud` returns the sentence itself. An "explain" script will return LLM text, with `wordAt()` returning `null`, so only the sentence is highlighted.

## Limits
- **English only:** Phonon 31m speaks English. Phonon also has multilingual models, but they're licensed CC BY-NC.
- **Phonon's word cursor** is aligned rather than reported, so within a clause it can run a word ahead of or behind the speech.
- **Scanned PDFs** have no text layer, so there's nothing to read. The app shows a notice; OCR isn't supported.
- **Reading order** follows the order text is stored in the PDF. That's usually right, but footnotes or sidebars can be read in the middle of a column.
- **Abbreviations** like "e.g." or "Dr." can split a sentence early. This comes from `Intl.Segmenter`.

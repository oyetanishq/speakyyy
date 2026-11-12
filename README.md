# pdf-speak

A personal web app that reads PDFs aloud. While it speaks, the current sentence and word are highlighted on the page.

- **Read aloud (Mode 1):**
  - Uses the browser's built-in speech (Web Speech API), so it's free and works offline.
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

The API key is stored in plain text in `localStorage`. That's fine for personal use, but don't host this somewhere other people sign in.

## How it works

```
apps/web/src
├─ lib/pdf/load.ts          the only pdfjs-dist import (worker + asset URLs)
├─ lib/pdf/text-model.ts    PDF text -> sentences -> words, each word pointing at
│                           exact characters of pdf.js text items
├─ lib/speech/narrator.ts   speechSynthesis queue, word events, fallbacks
├─ lib/speech/voices.ts     voice list store + default voice choice
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

### Narrator (`narrator.ts`)
- Speaks one utterance per sentence. The browser's `boundary` events move the word cursor.
- Some voices send no boundary events (e.g. Chrome's online Google voices). For those, the cursor is estimated from elapsed time, and the player shows "approximate cursor".
- Pause works by stopping and later restarting from the current word, because native pause is unreliable in Chrome.

### Mode 2 hook
The narrator speaks whatever a `Script` returns for each sentence. `readAloud` returns the sentence itself. An "explain" script will return LLM text, with `wordAt()` returning `null`, so only the sentence is highlighted.

## Limits
- **Scanned PDFs** have no text layer, so there's nothing to read. The app shows a notice; OCR isn't supported.
- **Reading order** follows the order text is stored in the PDF. That's usually right, but footnotes or sidebars can be read in the middle of a column.
- **Abbreviations** like "e.g." or "Dr." can split a sentence early. This comes from `Intl.Segmenter`.

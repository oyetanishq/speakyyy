import type { PDFDocumentProxy, TextContent, TextItem } from "@/lib/pdf/load";

/**
 * The reading model: the whole document as an ordered list of sentences, each
 * word pointing back at the exact characters of the pdf.js text items it came
 * from. Highlighting turns those pointers into DOM Ranges over the TextLayer
 * spans, which are created 1:1 from the same text items (same index, same
 * string), so the offsets line up exactly.
 *
 * Pages are processed one at a time and sentences become available as soon as
 * they are complete, so reading can start before a long PDF is fully parsed.
 * A sentence that runs across a page break is kept whole.
 */

/** A run of characters inside one pdf.js text item. */
export type Seg = { page: number; item: number; start: number; end: number };

export type Word = {
    /** Offsets into Sentence.text. */
    start: number;
    end: number;
    segs: Seg[];
};

export type Sentence = {
    index: number;
    text: string;
    /** Page of the first word (0-based). */
    page: number;
    words: Word[];
};

/** A position that survives re-parsing: the first character of a sentence. */
export type Anchor = { page: number; item: number; offset: number };

type WordRef = { sentence: number; word: number; item: number; start: number; end: number };

type PageSize = { width: number; height: number };

/** Chrome drops utterances that run past ~15 s, so long sentences are split. */
const MAX_CHUNK = 220;
/** A run of text with no sentence end (tables, lists) is force-emitted. */
const MAX_PENDING = 1500;
/** Marks characters we inserted (spaces between items) - no source position. */
const SYNTH = -1;

const sentenceSegmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });

function isTextItem(item: TextContent["items"][number]): item is TextItem {
    return "str" in item;
}

type Gap = "none" | "space" | "line" | "para";

/**
 * What separates two consecutive items visually? pdf.js emits a space item or
 * hasEOL in most cases; this catches PDFs that position words with gaps
 * instead of space characters, and spots headings: a new line in a different
 * font size is a "para" break, so a title isn't read as part of the first
 * sentence under it.
 */
function gapBetween(prev: TextItem, next: TextItem): Gap {
    const [a, b, c, d, x1, y1] = prev.transform as number[];
    const [na, nb, nc, nd, x2, y2] = next.transform as number[];
    // Rotated text: trust hasEOL only.
    if (Math.abs(b) > Math.abs(a) * 0.01 || Math.abs(nb) > Math.abs(na) * 0.01) return "none";
    const size = Math.max(Math.hypot(c, d), 1);
    const nextSize = Math.max(Math.hypot(nc, nd), 1);
    const h = Math.max(size, prev.height, 1);
    const newLine = Math.abs(y2 - y1) > h * 0.5 || x2 < x1 - h;
    if (newLine) return Math.max(size, nextSize) / Math.min(size, nextSize) > 1.15 ? "para" : "line";
    if (x2 - (x1 + prev.width) > h * 0.12) return "space";
    return "none";
}

function compareAnchor(a: Anchor, b: Anchor): number {
    return a.page - b.page || a.item - b.item || a.offset - b.offset;
}

export class DocText {
    readonly numPages: number;
    readonly sentences: Sentence[] = [];
    loadedPages = 0;
    done = false;
    /** Bumped on every (throttled) change; the useSyncExternalStore snapshot. */
    version = 0;

    #pdf: PDFDocumentProxy;
    #sizes: PageSize[] = [];
    #textContent = new Map<number, Promise<TextContent>>();
    #pageWords: WordRef[][] = [];
    #listeners = new Set<() => void>();
    #waiters = new Set<() => void>();
    #notifyTimer: ReturnType<typeof setTimeout> | null = null;
    #destroyed = false;

    // Text not yet emitted as sentences. One entry per UTF-16 code unit.
    #text = "";
    #srcPage: number[] = [];
    #srcItem: number[] = [];
    #srcOff: number[] = [];
    #prevItem: TextItem | null = null;
    #pendingBreak = false;

    private constructor(pdf: PDFDocumentProxy, firstPage: PageSize) {
        this.#pdf = pdf;
        this.numPages = pdf.numPages;
        this.#sizes[0] = firstPage;
        this.#pageWords = Array.from({ length: pdf.numPages }, () => []);
    }

    static async create(pdf: PDFDocumentProxy): Promise<DocText> {
        const page = await pdf.getPage(1);
        const { width, height } = page.getViewport({ scale: 1 });
        const doc = new DocText(pdf, { width, height });
        void doc.#run();
        return doc;
    }

    destroy() {
        this.#destroyed = true;
        if (this.#notifyTimer) clearTimeout(this.#notifyTimer);
        this.#listeners.clear();
        this.#wake();
    }

    /** Page size at scale 1. Unparsed pages borrow page 1's size. */
    pageSize(page: number): PageSize {
        return this.#sizes[page] ?? this.#sizes[0];
    }

    /** Shared with the TextLayer so item indices are guaranteed to match. */
    getTextContent(page: number): Promise<TextContent> {
        let p = this.#textContent.get(page);
        if (!p) {
            p = this.#pdf.getPage(page + 1).then((pg) => pg.getTextContent());
            this.#textContent.set(page, p);
        }
        return p;
    }

    subscribe = (fn: () => void) => {
        this.#listeners.add(fn);
        return () => {
            this.#listeners.delete(fn);
        };
    };

    getVersion = () => this.version;

    /** Resolves true once sentence `i` exists, false if the document ends first. */
    async waitFor(i: number): Promise<boolean> {
        while (i >= this.sentences.length) {
            if (this.done || this.#destroyed) return false;
            await new Promise<void>((resolve) => this.#waiters.add(resolve));
        }
        return true;
    }

    /** The word under a character of a text item, or the nearest one after it. */
    findWord(page: number, item: number, offset: number): { sentence: number; word: number } | null {
        const refs = this.#pageWords[page] ?? [];
        let best: WordRef | null = null;
        for (const r of refs) {
            if (r.item === item && offset >= r.start && offset < r.end) return r;
            if (!best && (r.item > item || (r.item === item && r.start >= offset))) best = r;
        }
        return best ?? refs.at(-1) ?? null;
    }

    anchorOf(sentence: number): Anchor | null {
        const seg = this.sentences[sentence]?.words[0]?.segs[0];
        return seg ? { page: seg.page, item: seg.item, offset: seg.start } : null;
    }

    /** Index of the first sentence at or after `anchor` (waits for parsing). */
    async findAnchor(anchor: Anchor): Promise<number> {
        let i = 0;
        for (;;) {
            for (; i < this.sentences.length; i++) {
                const a = this.anchorOf(i);
                if (a && compareAnchor(a, anchor) >= 0) return i;
            }
            if (!(await this.waitFor(i))) return Math.max(0, this.sentences.length - 1);
        }
    }

    // ---------------------------------------------------------------- parsing

    async #run() {
        try {
            for (let p = 0; p < this.numPages; p++) {
                if (this.#destroyed) return;
                const page = await this.#pdf.getPage(p + 1);
                const { width, height } = page.getViewport({ scale: 1 });
                this.#sizes[p] = { width, height };
                const content = await this.getTextContent(p);
                if (this.#destroyed) return;
                this.#appendPage(p, content);
                this.#flush(false);
                this.loadedPages = p + 1;
                this.#changed();
            }
            this.#flush(true);
        } catch (err) {
            if (!this.#destroyed) console.error("Text extraction failed", err);
        }
        this.done = true;
        this.#changed(true);
    }

    #push(ch: string, page: number, item: number, off: number) {
        this.#text += ch;
        this.#srcPage.push(page);
        this.#srcItem.push(item);
        this.#srcOff.push(off);
    }

    #pop() {
        this.#text = this.#text.slice(0, -1);
        this.#srcPage.pop();
        this.#srcItem.pop();
        this.#srcOff.pop();
    }

    #appendPage(page: number, content: TextContent) {
        const items = content.items;
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (!isTextItem(it)) continue;
            const str = it.str;
            if (str.length === 0) {
                if (it.hasEOL) this.#pendingBreak = true;
                continue;
            }

            if (this.#text.length > 0) {
                let gap: Gap = this.#prevItem ? gapBetween(this.#prevItem, it) : "none";
                if (this.#pendingBreak && (gap === "none" || gap === "space")) gap = "line";
                const t = this.#text;
                const last = t.at(-1);
                if (gap === "para") {
                    // LF is a hard sentence boundary for Intl.Segmenter.
                    if (last === " ") this.#pop();
                    this.#push("\n", page, SYNTH, SYNTH);
                } else if (gap === "line" && last === "-" && /\p{L}/u.test(t.at(-2) ?? "") && /^\p{Ll}/u.test(str)) {
                    // "exam-" + "ple" at a line break -> "example"
                    this.#pop();
                } else if (gap !== "none" && last !== " " && last !== "\n" && !/^\s/.test(str)) {
                    this.#push(" ", page, SYNTH, SYNTH);
                }
            }

            for (let j = 0; j < str.length; j++) {
                const ch = str[j];
                if (ch === "­") continue; // soft hyphen
                this.#push(/\s/.test(ch) ? " " : ch, page, i, j);
            }
            this.#pendingBreak = it.hasEOL;
            this.#prevItem = it;
        }
        // A page break always separates words.
        this.#pendingBreak = true;
        this.#prevItem = null;
    }

    /** Emit every complete sentence in the buffer; keep the trailing fragment. */
    #flush(final: boolean) {
        if (!this.#text.trim()) {
            if (final) this.#consume(this.#text.length);
            return;
        }
        const parts = [...sentenceSegmenter.segment(this.#text)];
        let consumed = 0;
        for (let k = 0; k < parts.length; k++) {
            const { index, segment } = parts[k];
            if (k === parts.length - 1 && !final) {
                const complete = /[.!?…]["'”’)\]]*\s*$|\n\s*$/.test(segment);
                if (!complete && this.#text.length - index < MAX_PENDING) break;
            }
            this.#emitSentence(index, index + segment.length);
            consumed = index + segment.length;
        }
        this.#consume(consumed);
    }

    #consume(n: number) {
        if (n <= 0) return;
        this.#text = this.#text.slice(n);
        this.#srcPage.splice(0, n);
        this.#srcItem.splice(0, n);
        this.#srcOff.splice(0, n);
    }

    /** Split one segmenter sentence into speakable chunks of <= MAX_CHUNK. */
    #emitSentence(start: number, end: number) {
        const text = this.#text.slice(start, end);
        const words: { s: number; e: number }[] = [];
        for (const w of wordSegmenter.segment(text)) {
            if (w.isWordLike) words.push({ s: w.index, e: w.index + w.segment.length });
        }
        if (words.length === 0) return;

        let chunk: typeof words = [];
        let chunkStart = words[0].s;
        let lastBreak = -1; // index in `chunk` of a word followed by , ; : etc.
        for (const w of words) {
            if (chunk.length > 0 && w.e - chunkStart > MAX_CHUNK) {
                const cutAfter = lastBreak >= chunk.length / 2 ? lastBreak : chunk.length - 1;
                const keep = chunk.slice(0, cutAfter + 1);
                const rest = chunk.slice(cutAfter + 1);
                const nextStart = rest[0]?.s ?? w.s;
                this.#emitChunk(start, chunkStart, nextStart, keep);
                chunk = rest;
                chunkStart = nextStart;
                lastBreak = -1;
            }
            chunk.push(w);
            if (/^[,;:)\]—–]/.test(text.slice(w.e, w.e + 1))) lastBreak = chunk.length - 1;
        }
        const tail = text.length;
        this.#emitChunk(start, chunkStart, tail, chunk);
    }

    /** `from`/`to` and word offsets are relative to the buffer at `base`. */
    #emitChunk(base: number, from: number, to: number, words: { s: number; e: number }[]) {
        const raw = this.#text.slice(base + from, base + to);
        const trimmed = raw.trimEnd();
        const index = this.sentences.length;
        const out: Word[] = [];
        for (const w of words) {
            const segs = this.#segsFor(base + w.s, base + w.e);
            if (segs.length > 0) out.push({ start: w.s - from, end: w.e - from, segs });
        }
        if (out.length === 0) return;

        out.forEach((w, wi) => {
            for (const seg of w.segs) {
                this.#pageWords[seg.page]?.push({ sentence: index, word: wi, item: seg.item, start: seg.start, end: seg.end });
            }
        });
        this.sentences.push({ index, text: trimmed, page: out[0].segs[0].page, words: out });
    }

    #segsFor(from: number, to: number): Seg[] {
        const segs: Seg[] = [];
        for (let k = from; k < to; k++) {
            const item = this.#srcItem[k];
            if (item === SYNTH) continue;
            const page = this.#srcPage[k];
            const off = this.#srcOff[k];
            const last = segs.at(-1);
            if (last && last.page === page && last.item === item && last.end === off) last.end++;
            else segs.push({ page, item, start: off, end: off + 1 });
        }
        return segs;
    }

    // ---------------------------------------------------------------- events

    #wake() {
        const waiters = [...this.#waiters];
        this.#waiters.clear();
        for (const w of waiters) w();
    }

    /** Waiters wake immediately; UI listeners are throttled to ~10 Hz. */
    #changed(now = false) {
        this.#wake();
        if (this.#notifyTimer && !now) return;
        if (this.#notifyTimer) clearTimeout(this.#notifyTimer);
        const fire = () => {
            this.#notifyTimer = null;
            this.version++;
            for (const fn of this.#listeners) fn();
        };
        if (now) fire();
        else this.#notifyTimer = setTimeout(fire, 100);
    }
}

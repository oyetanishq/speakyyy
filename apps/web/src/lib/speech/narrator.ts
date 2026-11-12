import type { DocText, Sentence } from "@/lib/pdf/text-model";

/**
 * What to actually say for a sentence. This is the seam for Mode 2: read-aloud
 * speaks the sentence itself; an "explain" script would return LLM text whose
 * wordAt() returns null (sentence-level highlight only).
 */
export type Utterance = {
    text: string;
    /** Map a char index of `text` to a word index of the sentence. */
    wordAt: (charIndex: number) => number | null;
};
export type Script = (sentence: Sentence, fromWord: number) => Utterance | Promise<Utterance>;

export function wordIndexAt(sentence: Sentence, char: number): number {
    const words = sentence.words;
    let lo = 0;
    let hi = words.length - 1;
    while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if (words[mid].start <= char) lo = mid;
        else hi = mid - 1;
    }
    return lo;
}

export const readAloud: Script = (sentence, fromWord) => {
    const offset = sentence.words[fromWord]?.start ?? 0;
    return {
        text: sentence.text.slice(offset),
        wordAt: (ci) => wordIndexAt(sentence, offset + ci),
    };
};

export type NarratorStatus = "idle" | "playing" | "paused";

export type NarratorState = {
    status: NarratorStatus;
    sentence: number;
    word: number | null;
    /** How the word cursor is driven: real boundary events, or a time estimate. */
    tracking: "boundary" | "estimated" | null;
    error: string | null;
};

/** Average speaking speed at rate 1, used when a voice sends no word events. */
const CHARS_PER_SECOND = 14.5;
/** How long to wait for the first boundary event before estimating. */
const BOUNDARY_GRACE_MS = 450;

const synth: SpeechSynthesis | null = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;

class Narrator {
    readonly supported = synth !== null;

    #state: NarratorState = { status: "idle", sentence: 0, word: 0, tracking: null, error: null };
    #listeners = new Set<() => void>();
    #doc: DocText | null = null;
    #script: Script = readAloud;
    #voice: SpeechSynthesisVoice | null = null;
    #rate = 1;
    /** Bumped on every start/stop; stale callbacks compare and bail. */
    #session = 0;
    /**
     * The live utterance - held so Chrome can't GC it mid-speech (which drops
     * its end event) - and the controller that detaches its listeners.
     */
    #current: { utterance: SpeechSynthesisUtterance; listeners: AbortController } | null = null;
    #estimateTimer: ReturnType<typeof setInterval> | null = null;

    constructor() {
        // Chrome keeps speaking across reloads unless cancelled.
        if (typeof window !== "undefined") window.addEventListener("pagehide", () => synth?.cancel());
    }

    subscribe = (fn: () => void) => {
        this.#listeners.add(fn);
        return () => {
            this.#listeners.delete(fn);
        };
    };

    getState = () => this.#state;

    #set(patch: Partial<NarratorState>) {
        this.#state = { ...this.#state, ...patch };
        for (const fn of this.#listeners) fn();
    }

    setDoc(doc: DocText | null) {
        this.#halt();
        this.#doc = doc;
        this.#set({ status: "idle", sentence: 0, word: 0, tracking: null, error: null });
    }

    setScript(script: Script) {
        this.#script = script;
        this.#restartIfPlaying();
    }

    setVoice(voice: SpeechSynthesisVoice | null) {
        if (voice?.voiceURI === this.#voice?.voiceURI) return;
        this.#voice = voice;
        this.#restartIfPlaying();
    }

    setRate(rate: number) {
        if (rate === this.#rate) return;
        this.#rate = rate;
        this.#restartIfPlaying();
    }

    play() {
        if (!this.#doc || !synth) return;
        const { sentence, word } = this.#state;
        const atEnd = this.#doc.done && sentence >= this.#doc.sentences.length;
        void this.#speakFrom(atEnd ? 0 : sentence, atEnd ? 0 : (word ?? 0));
    }

    pause() {
        if (this.#state.status !== "playing") return;
        this.#halt();
        this.#set({ status: "paused" });
    }

    toggle() {
        if (this.#state.status === "playing") this.pause();
        else this.play();
    }

    stop() {
        this.#halt();
        this.#set({ status: "idle" });
    }

    /** Jump to a sentence/word. Keeps playing if it was playing. */
    seek(sentence: number, word = 0, opts: { play?: boolean } = {}) {
        const doc = this.#doc;
        if (!doc) return;
        const max = doc.done ? doc.sentences.length - 1 : Number.POSITIVE_INFINITY;
        const s = Math.max(0, Math.min(sentence, max));
        const play = opts.play ?? this.#state.status === "playing";
        if (play) {
            void this.#speakFrom(s, word);
        } else {
            this.#halt();
            this.#set({ sentence: s, word, status: this.#state.status === "playing" ? "paused" : this.#state.status });
        }
    }

    next() {
        this.seek(this.#state.sentence + 1, 0);
    }

    /** Restart the sentence if we're into it, otherwise go to the previous one. */
    prev() {
        const { sentence, word } = this.#state;
        this.seek((word ?? 0) > 1 ? sentence : sentence - 1, 0);
    }

    // ---------------------------------------------------------------- engine

    #restartIfPlaying() {
        if (this.#state.status === "playing") void this.#speakFrom(this.#state.sentence, this.#state.word ?? 0);
    }

    #halt() {
        this.#session++;
        this.#stopEstimate();
        this.#current?.listeners.abort();
        this.#current = null;
        synth?.cancel();
    }

    #stopEstimate() {
        if (this.#estimateTimer) clearInterval(this.#estimateTimer);
        this.#estimateTimer = null;
    }

    async #speakFrom(sentenceIndex: number, wordIndex: number) {
        const doc = this.#doc;
        if (!doc || !synth) return;
        this.#halt();
        const session = this.#session;
        this.#set({ status: "playing", sentence: sentenceIndex, word: wordIndex, error: null });

        if (!(await doc.waitFor(sentenceIndex))) {
            if (session === this.#session) this.#set({ status: "idle", sentence: doc.sentences.length, word: null });
            return;
        }
        if (session !== this.#session) return;

        const sentence = doc.sentences[sentenceIndex];
        const from = Math.min(wordIndex, sentence.words.length - 1);
        const utt = await this.#script(sentence, from);
        if (session !== this.#session) return;

        const u = new SpeechSynthesisUtterance(utt.text);
        u.rate = this.#rate;
        if (this.#voice) {
            u.voice = this.#voice;
            u.lang = this.#voice.lang;
        }

        let sawBoundary = false;
        const setWord = (ci: number) => {
            const w = utt.wordAt(ci);
            if (w !== this.#state.word) this.#set({ word: w });
        };

        const listeners = new AbortController();
        const on = <K extends keyof SpeechSynthesisUtteranceEventMap>(
            type: K,
            fn: (e: SpeechSynthesisUtteranceEventMap[K]) => void,
        ) => u.addEventListener(type, fn, { signal: listeners.signal });

        on("start", () => {
            if (session !== this.#session) return;
            const startedAt = performance.now();
            this.#estimateTimer = setInterval(() => {
                if (session !== this.#session || sawBoundary) return this.#stopEstimate();
                const elapsed = performance.now() - startedAt;
                if (elapsed < BOUNDARY_GRACE_MS) return;
                if (this.#state.tracking !== "estimated") this.#set({ tracking: "estimated" });
                setWord(Math.floor((elapsed / 1000) * CHARS_PER_SECOND * this.#rate));
            }, 80);
        });
        on("boundary", (e) => {
            if (session !== this.#session || e.name !== "word") return;
            if (!sawBoundary) {
                sawBoundary = true;
                this.#stopEstimate();
                if (this.#state.tracking !== "boundary") this.#set({ tracking: "boundary" });
            }
            setWord(e.charIndex);
        });
        on("end", () => {
            if (session !== this.#session) return;
            this.#stopEstimate();
            void this.#speakFrom(sentenceIndex + 1, 0);
        });
        on("error", (e) => {
            if (session !== this.#session) return;
            if (e.error === "interrupted" || e.error === "canceled") return;
            this.#halt();
            const message =
                e.error === "not-allowed"
                    ? "The browser blocked speech. Click play again."
                    : `Speech failed (${e.error}). Try another voice.`;
            this.#set({ status: "paused", error: message });
        });

        this.#current = { utterance: u, listeners };
        // Chrome can get stuck "paused" after the tab was hidden.
        if (synth.paused) synth.resume();
        synth.speak(u);
    }
}

export const narrator = new Narrator();

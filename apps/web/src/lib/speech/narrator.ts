import type { DocText, Sentence } from "@/lib/pdf/text-model";
import type { Playback } from "@/lib/speech/engine";
import { DEFAULT_VOICE, speakPhonon } from "@/lib/speech/phonon";

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
    /** Playing, but waiting for audio (model download, synthesis). */
    buffering: boolean;
    error: string | null;
};

/** Sentences synthesised ahead of the one playing. */
const PREFETCH = 2;

class Narrator {
    /** Phonon runs in a module worker on WebAssembly. */
    readonly supported = typeof Worker !== "undefined" && typeof WebAssembly === "object";

    #state: NarratorState = { status: "idle", sentence: 0, word: 0, buffering: false, error: null };
    #listeners = new Set<() => void>();
    #doc: DocText | null = null;
    #script: Script = readAloud;
    #voice = DEFAULT_VOICE;
    #rate = 1;
    /** Bumped on every start/stop; stale callbacks compare and bail. */
    #session = 0;
    #playback: Playback | null = null;

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
        this.#set({ status: "idle", sentence: 0, word: 0, buffering: false, error: null });
    }

    setScript(script: Script) {
        this.#script = script;
        this.#restart();
    }

    /** A Phonon voice id: one from the catalog, or BUNDLED_VOICE. */
    setVoice(voice: string) {
        if (voice === this.#voice) return;
        this.#voice = voice;
        this.#restart();
    }

    setRate(rate: number) {
        if (rate === this.#rate) return;
        this.#rate = rate;
        this.#playback?.setRate(rate);
    }

    play() {
        if (!this.#doc || !this.supported) return;
        if (this.#state.status === "paused" && this.#playback) {
            this.#playback.resume();
            this.#set({ status: "playing", error: null });
            return;
        }
        const { sentence, word } = this.#state;
        const atEnd = this.#doc.done && sentence >= this.#doc.sentences.length;
        void this.#speakFrom(atEnd ? 0 : sentence, atEnd ? 0 : (word ?? 0));
    }

    pause() {
        if (this.#state.status !== "playing") return;
        this.#playback?.pause();
        this.#set({ status: "paused", buffering: false });
    }

    toggle() {
        if (this.#state.status === "playing") this.pause();
        else this.play();
    }

    stop() {
        this.#halt();
        this.#set({ status: "idle", buffering: false });
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
            const status = this.#state.status === "playing" ? "paused" : this.#state.status;
            this.#set({ sentence: s, word, status, buffering: false });
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

    /** Apply a voice/script change: replay from the current word if playing. */
    #restart() {
        if (this.#state.status === "playing") void this.#speakFrom(this.#state.sentence, this.#state.word ?? 0);
        else if (this.#state.status === "paused") this.#halt(); // resume re-speaks with the new settings
    }

    #halt() {
        this.#session++;
        this.#playback?.stop();
        this.#playback = null;
    }

    /** Texts of the next sentences, synthesised ahead so playback has no gaps. */
    #upcoming(after: number): string[] {
        const out: string[] = [];
        for (let k = 1; k <= PREFETCH; k++) {
            const s = this.#doc?.sentences[after + k];
            if (!s) break;
            const u = this.#script(s, 0);
            if (!(u instanceof Promise)) out.push(u.text);
        }
        return out;
    }

    async #speakFrom(sentenceIndex: number, wordIndex: number) {
        const doc = this.#doc;
        const voice = this.#voice;
        if (!doc) return;
        this.#halt();
        const session = this.#session;
        this.#set({ status: "playing", sentence: sentenceIndex, word: wordIndex, buffering: true, error: null });

        if (!(await doc.waitFor(sentenceIndex))) {
            if (session === this.#session) {
                this.#set({ status: "idle", sentence: doc.sentences.length, word: null, buffering: false });
            }
            return;
        }
        if (session !== this.#session) return;

        const sentence = doc.sentences[sentenceIndex];
        const from = Math.min(wordIndex, sentence.words.length - 1);
        const utt = await this.#script(sentence, from);
        if (session !== this.#session) return;

        const live = () => session === this.#session;
        const handlers = {
            onStart: () => {
                if (live()) this.#set({ buffering: false });
            },
            onPosition: (charIndex: number) => {
                if (!live()) return;
                const word = utt.wordAt(charIndex);
                if (word !== this.#state.word) this.#set({ word });
            },
            onEnd: () => {
                if (live()) void this.#speakFrom(sentenceIndex + 1, 0);
            },
            onError: (error: string) => {
                if (!live()) return;
                this.#halt();
                this.#set({ status: "paused", buffering: false, error });
            },
        };

        this.#playback = speakPhonon(utt.text, voice, this.#rate, this.#upcoming(sentenceIndex), handlers);
    }
}

export const narrator = new Narrator();

// Dev-only handle for poking at playback from the console and e2e scripts.
if (import.meta.env.DEV) Object.assign(window, { __narrator: narrator });

/**
 * Phonon: neural text-to-speech running on-device (WebAssembly in a worker).
 * The ONLY module that imports phonon-tts (enforced by .oxlintrc.json).
 *
 * - The model (~65 MB, Phonon 31m English) downloads on first use and is kept
 *   in the browser's Cache API, so later loads take well under a second.
 * - Each sentence is synthesised whole, and the next ones are prefetched, so
 *   playback runs back to back. On a laptop CPU it generates ~13x faster than
 *   realtime.
 * - Audio plays through an <audio> element: speed changes are instant and keep
 *   the pitch, and pause is a real pause.
 */
import { encodeWav, PhononTTS } from "phonon-tts";
import { buildTimeline } from "@/lib/speech/align";
import type { Playback, PlaybackHandlers } from "@/lib/speech/engine";
import { createStore } from "@/lib/store";

export type PhononStatus =
    | { kind: "idle" }
    | { kind: "loading"; loaded: number; total: number | null }
    | { kind: "ready" }
    | { kind: "error"; message: string };

export type CatalogVoice = { id: string; name: string; gender: string; locale: string; description: string };

/** The voice bundled with the model itself. */
export const BUNDLED_VOICE = "default";
/** The app's default: "Russell" from the catalog (male, en-US). */
export const DEFAULT_VOICE = "_6Aslh2DxfmnRLmP";
export const DEFAULT_VOICE_LABEL = "Russell · male";

/** gradium/phonon-voices, pinned so voice files can't change under us (Apache-2.0). */
const VOICES_REPO = "https://huggingface.co/gradium/phonon-voices/resolve/0ee17205f254b5abc43b266c8a0f215565c352f7/";

/** Highlight a word this much before its estimated start; feels in sync. */
const LEAD_SEC = 0.05;
/** Synthesised sentences kept around (current + prefetched + a few behind). */
const MAX_CLIPS = 8;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));
const isAbort = (err: unknown) => err instanceof DOMException && err.name === "AbortError";

// ------------------------------------------------------------------ model

export const phononStatus = createStore<PhononStatus>({ kind: "idle" });
let model: Promise<PhononTTS> | null = null;

export function loadPhonon(): Promise<PhononTTS> {
    if (model) return model;
    phononStatus.set({ kind: "loading", loaded: 0, total: null });
    let lastPercent = -1;
    model = PhononTTS.load({
        lang: "en",
        onProgress: ({ file, loaded, total, cached }) => {
            if (file !== "weights" || cached) return;
            const percent = total ? Math.floor((loaded / total) * 100) : -1;
            if (total && percent === lastPercent) return;
            lastPercent = percent;
            phononStatus.set({ kind: "loading", loaded, total });
        },
    }).then(
        (tts) => {
            phononStatus.set({ kind: "ready" });
            return tts;
        },
        (err: unknown) => {
            model = null;
            phononStatus.set({ kind: "error", message: message(err) });
            throw err;
        },
    );
    return model;
}

// ------------------------------------------------------------------ voices

export const phononCatalog = createStore<CatalogVoice[]>([]);
const voiceFiles = new Map<string, string>();
let catalogLoad: Promise<void> | null = null;

/** The English voices of the Phonon catalog (37 at the pinned revision). */
export function loadCatalog(): Promise<void> {
    catalogLoad ??= fetch(`${VOICES_REPO}voices.jsonl`)
        .then((res) => {
            if (!res.ok) throw new Error(`voice catalog: ${res.status}`);
            return res.text();
        })
        .then((jsonl) => {
            type Row = { filename: string; name: string; voice_id: string; language: string; locale: string; gender: string; description: string };
            const rows = jsonl
                .split("\n")
                .filter((l) => l.trim())
                .map((l) => JSON.parse(l) as Row)
                .filter((r) => r.language === "en");
            for (const r of rows) voiceFiles.set(r.voice_id, r.filename);
            phononCatalog.set(
                rows
                    .map((r) => ({ id: r.voice_id, name: r.name, gender: r.gender, locale: r.locale, description: r.description }))
                    .toSorted((a, b) => a.name.localeCompare(b.name)),
            );
        })
        .catch((err: unknown) => {
            catalogLoad = null;
            console.warn("Couldn't load the Phonon voice catalog", err);
        });
    return catalogLoad;
}

const voiceLoads = new Map<string, Promise<void>>();

function ensureVoice(tts: PhononTTS, id: string): Promise<void> {
    if (id === BUNDLED_VOICE || tts.voices.includes(id)) return Promise.resolve();
    let p = voiceLoads.get(id);
    if (!p) {
        p = (async () => {
            await loadCatalog();
            const file = voiceFiles.get(id);
            if (!file) throw new Error(`unknown voice "${id}"`);
            await tts.addVoice(id, `${VOICES_REPO}${file}`);
        })();
        p.catch(() => voiceLoads.delete(id));
        voiceLoads.set(id, p);
    }
    return p;
}

/** Load the model and fetch a voice ahead of time, so the first play doesn't wait. */
export async function prepareVoice(id: string): Promise<void> {
    await ensureVoice(await loadPhonon(), id);
}

// ------------------------------------------------------------------ synthesis

type Clip = { pcm: Float32Array; sampleRate: number };
type Job = { clip: Promise<Clip>; ctrl: AbortController; settled: boolean };

/** Insertion-ordered, so the first entry is the least recently used. */
const jobs = new Map<string, Job>();
const keyOf = (voice: string, text: string) => `${voice}\u0000${text}`;

function request(voice: string, text: string): Job {
    const key = keyOf(voice, text);
    const hit = jobs.get(key);
    if (hit) {
        jobs.delete(key);
        jobs.set(key, hit);
        return hit;
    }
    const ctrl = new AbortController();
    const job: Job = {
        ctrl,
        settled: false,
        clip: (async () => {
            const tts = await loadPhonon();
            await ensureVoice(tts, voice);
            ctrl.signal.throwIfAborted();
            const pcm = await tts.synth(text, { voice: voice === BUNDLED_VOICE ? undefined : voice, signal: ctrl.signal });
            return { pcm, sampleRate: tts.sampleRate };
        })(),
    };
    job.clip.then(
        () => {
            job.settled = true;
        },
        () => {
            job.settled = true;
            if (jobs.get(key) === job) jobs.delete(key);
        },
    );
    jobs.set(key, job);
    while (jobs.size > MAX_CLIPS) {
        const [oldKey, old] = jobs.entries().next().value as [string, Job];
        jobs.delete(oldKey);
        if (!old.settled) old.ctrl.abort();
    }
    return job;
}

/**
 * The worker runs requests one at a time, in order. Cancel queued work that's
 * no longer wanted (after a seek) so what's needed now isn't stuck behind it.
 */
function retainOnly(wanted: Set<string>) {
    for (const [key, job] of jobs) {
        if (!job.settled && !wanted.has(key)) {
            job.ctrl.abort();
            jobs.delete(key);
        }
    }
}

export function speakPhonon(
    text: string,
    voice: string,
    rate: number,
    upcoming: string[],
    h: PlaybackHandlers,
): Playback {
    retainOnly(new Set([text, ...upcoming].map((t) => keyOf(voice, t))));
    const job = request(voice, text);
    for (const t of upcoming) request(voice, t);

    let stopped = false;
    let paused = false;
    let audio: HTMLAudioElement | null = null;
    let url: string | null = null;
    let raf = 0;
    let timeline: ((s: number) => number) | null = null;

    const tick = () => {
        if (stopped || !audio || !timeline) return;
        h.onPosition(timeline(audio.currentTime + LEAD_SEC));
        raf = requestAnimationFrame(tick);
    };

    const cleanup = () => {
        cancelAnimationFrame(raf);
        if (audio) {
            audio.pause();
            audio.removeAttribute("src");
            audio.load();
        }
        if (url) URL.revokeObjectURL(url);
        audio = null;
        url = null;
    };

    const start = (el: HTMLAudioElement) =>
        el.play().then(
            () => {
                if (stopped || paused) return;
                h.onStart();
                cancelAnimationFrame(raf);
                tick();
            },
            (err: unknown) => {
                if (stopped || isAbort(err)) return;
                h.onError(
                    err instanceof DOMException && err.name === "NotAllowedError"
                        ? "The browser blocked audio. Press play again."
                        : `Playback failed: ${message(err)}`,
                );
            },
        );

    job.clip.then(
        ({ pcm, sampleRate }) => {
            if (stopped) return;
            timeline = buildTimeline(text, pcm, sampleRate);
            url = URL.createObjectURL(encodeWav(pcm, sampleRate));
            const el = new Audio(url);
            el.preservesPitch = true;
            el.playbackRate = rate;
            el.addEventListener("ended", () => {
                if (stopped) return;
                cleanup();
                h.onEnd();
            });
            audio = el;
            if (!paused) void start(el);
        },
        (err: unknown) => {
            if (!stopped && !isAbort(err)) h.onError(`Natural voice failed: ${message(err)}`);
        },
    );

    return {
        stop() {
            stopped = true;
            cleanup();
        },
        pause() {
            paused = true;
            cancelAnimationFrame(raf);
            audio?.pause();
        },
        resume() {
            paused = false;
            if (audio) void start(audio);
        },
        setRate(r) {
            rate = r;
            if (audio) audio.playbackRate = r;
        },
    };
}

/**
 * Phonon returns audio only - no word timings. This estimates when each word
 * starts from the audio itself:
 *
 *  1. An energy envelope finds where speech starts and ends (dropping the
 *     leading/trailing silence) and the pauses inside it.
 *  2. Each word gets a weight (its letters, plus a pause after , ; : . ! ?).
 *  3. Pauses in the audio are matched to punctuation pauses in the text and
 *     pinned as anchors; words between anchors are spread by weight.
 *
 * Anchoring at the pauses is what keeps a long sentence in sync: the error of
 * a pure "letters per second" guess grows with every word, while here it
 * resets at every comma.
 */

/** Maps a playback time (seconds) to the char index of the word being spoken. */
export type Timeline = (seconds: number) => number;

const FRAME_SEC = 0.01;
/**
 * A silence must last this long (seconds) to count as a pause. Comma/period
 * pauses run 0.25-0.5 s; the closure before a p/t/k inside a word can reach
 * ~0.15 s once blips are merged, and must not be mistaken for one.
 */
const MIN_PAUSE_SEC = 0.2;
/** A voiced blip shorter than this (seconds) inside a pause doesn't split it. */
const MAX_BLIP_SEC = 0.06;
/**
 * Word tokens: split at whitespace AND hyphens/slashes, like the highlighter's
 * Intl.Segmenter words ("non-experts" is two words there). Trailing
 * punctuation stays on the token so pauses after "," "." can be spotted.
 */
const TOKEN = /[^\s\-‐‑–—/]+/g;

type Point = { w: number; t: number };

function envelope(pcm: Float32Array, sampleRate: number) {
    const hop = Math.max(1, Math.round(sampleRate * FRAME_SEC));
    const frames = Math.floor(pcm.length / hop);
    const rms = new Float32Array(frames);
    let peak = 0;
    for (let f = 0; f < frames; f++) {
        let sum = 0;
        for (let i = f * hop; i < (f + 1) * hop; i++) sum += pcm[i] * pcm[i];
        rms[f] = Math.sqrt(sum / hop);
        if (rms[f] > peak) peak = rms[f];
    }
    const threshold = Math.max(peak * 0.06, 0.002);
    return { voiced: Array.from(rms, (r) => r > threshold), frames };
}

function interpolate(points: Point[], w: number): number {
    if (w <= points[0].w) return points[0].t;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        if (w <= b.w) return b.w === a.w ? a.t : a.t + ((w - a.w) / (b.w - a.w)) * (b.t - a.t);
    }
    return points[points.length - 1].t;
}

export function buildTimeline(text: string, pcm: Float32Array, sampleRate: number): Timeline {
    const matches = [...text.matchAll(TOKEN)];
    const words = matches.map((m) => m.index);
    const tokens = matches.map((m) => m[0]);
    if (words.length === 0) return () => 0;

    // 1 · speech bounds and internal pauses
    const { voiced, frames } = envelope(pcm, sampleRate);
    let first = voiced.indexOf(true);
    let last = voiced.lastIndexOf(true);
    if (first < 0) {
        first = 0;
        last = Math.max(0, frames - 1);
    }
    const t0 = first * FRAME_SEC;
    const t1 = (last + 1) * FRAME_SEC;
    const silences: { start: number; end: number }[] = [];
    for (let f = first; f <= last; ) {
        if (voiced[f]) {
            f++;
            continue;
        }
        const s = f;
        while (f <= last && !voiced[f]) f++;
        const prev = silences.at(-1);
        if (prev && s * FRAME_SEC - prev.end <= MAX_BLIP_SEC) prev.end = f * FRAME_SEC;
        else silences.push({ start: s * FRAME_SEC, end: f * FRAME_SEC });
    }
    const gaps = silences.filter((g) => g.end - g.start >= MIN_PAUSE_SEC);

    // 2 · weights
    const startW: number[] = [];
    const endW: number[] = [];
    const pauseAfter: number[] = [];
    let w = 0;
    tokens.forEach((tok, i) => {
        startW[i] = w;
        w += Math.max(1, tok.replace(/[^\p{L}\p{N}]/gu, "").length) + 0.6;
        endW[i] = w;
        pauseAfter[i] = /[.!?…]["'”’)\]]*$/u.test(tok) ? 4 : /[,;:—–]["'”’)\]]*$/u.test(tok) ? 2.5 : 0;
        w += pauseAfter[i];
    });
    const total = endW[endW.length - 1];

    // 3 · anchor audio pauses to punctuation pauses
    const points: Point[] = [{ w: 0, t: t0 }];
    let lastK = -1;
    for (const gap of gaps) {
        // Where the text "should" be at this pause, judged from the last anchor.
        const anchor = points[points.length - 1];
        const progress = ((gap.start + gap.end) / 2 - anchor.t) / Math.max(t1 - anchor.t, 1e-6);
        const expected = anchor.w + (total - anchor.w) * progress;
        let best = -1;
        let bestDiff = Number.POSITIVE_INFINITY;
        for (let k = lastK + 1; k < tokens.length - 1; k++) {
            if (!pauseAfter[k]) continue;
            const diff = Math.abs((endW[k] + startW[k + 1]) / 2 - expected);
            if (diff < bestDiff) {
                best = k;
                bestDiff = diff;
            }
        }
        if (best >= 0 && bestDiff < total * 0.2) {
            points.push({ w: endW[best], t: gap.start }, { w: startW[best + 1], t: gap.end });
            lastK = best;
        }
    }
    points.push({ w: total, t: t1 });

    const starts = startW.map((sw) => interpolate(points, sw));
    return (seconds) => {
        let lo = 0;
        let hi = starts.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (starts[mid] <= seconds) lo = mid;
            else hi = mid - 1;
        }
        return words[lo];
    };
}

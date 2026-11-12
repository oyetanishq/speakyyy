/**
 * speechSynthesis.getVoices() returns a NEW array per call and fills in
 * asynchronously (empty until `voiceschanged` in Chrome), so it's cached here
 * to be a stable useSyncExternalStore snapshot.
 */
const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;

let voices: SpeechSynthesisVoice[] = synth?.getVoices() ?? [];
const listeners = new Set<() => void>();

synth?.addEventListener("voiceschanged", () => {
    voices = synth.getVoices();
    for (const fn of listeners) fn();
});

export function subscribeVoices(fn: () => void) {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export function getVoices() {
    return voices;
}

/**
 * Local voices first: Chrome's online "Google" voices send no word boundary
 * events, so the highlight would have to be estimated.
 */
export function pickDefaultVoice(list: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
    const lang = (typeof navigator !== "undefined" ? navigator.language : "en-US").toLowerCase();
    const base = lang.split("-")[0];
    const local = list.filter((v) => v.localService);
    const matches = (v: SpeechSynthesisVoice, exact: boolean) =>
        exact ? v.lang.toLowerCase() === lang : v.lang.toLowerCase().startsWith(base);
    return (
        local.find((v) => v.default && matches(v, false)) ??
        local.find((v) => matches(v, true)) ??
        local.find((v) => matches(v, false)) ??
        list.find((v) => matches(v, false)) ??
        list[0] ??
        null
    );
}

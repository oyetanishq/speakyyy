/**
 * App settings in localStorage. Plain text, including the API key - fine for
 * a personal tool, don't deploy this where others sign in.
 */
export type Settings = {
    llm: { baseUrl: string; model: string; apiKey: string };
    speech: { voiceURI: string | null; rate: number };
};

const KEY = "pdf-speak:settings";

export const DEFAULT_SETTINGS: Settings = {
    llm: { baseUrl: "", model: "", apiKey: "" },
    speech: { voiceURI: null, rate: 1 },
};

export const RATE_MIN = 0.5;
export const RATE_MAX = 2.5;

function read(): Settings {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return DEFAULT_SETTINGS;
        const parsed = JSON.parse(raw) as Partial<Settings>;
        return {
            llm: { ...DEFAULT_SETTINGS.llm, ...parsed.llm },
            speech: { ...DEFAULT_SETTINGS.speech, ...parsed.speech },
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
}

let current = read();
const listeners = new Set<() => void>();

function emit() {
    for (const fn of listeners) fn();
}

// Another tab changed them.
window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    current = read();
    emit();
});

export function subscribeSettings(fn: () => void) {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export function getSettings() {
    return current;
}

export function updateSettings(fn: (s: Settings) => Settings) {
    current = fn(current);
    try {
        localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
        // Storage full or blocked: keep the in-memory value for this session.
    }
    emit();
}

export function clampRate(rate: number) {
    return Math.round(Math.min(RATE_MAX, Math.max(RATE_MIN, rate)) * 100) / 100;
}

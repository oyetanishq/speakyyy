import { useSyncExternalStore } from "react";
import { narrator } from "@/lib/speech/narrator";
import { getVoices, subscribeVoices } from "@/lib/speech/voices";
import { getSettings, subscribeSettings } from "@/lib/storage/settings";
import type { DocText } from "@/lib/pdf/text-model";

/** React bindings for the module-level stores. */

export function useNarrator() {
    return useSyncExternalStore(narrator.subscribe, narrator.getState);
}

export function useVoices() {
    return useSyncExternalStore(subscribeVoices, getVoices);
}

export function useSettings() {
    return useSyncExternalStore(subscribeSettings, getSettings);
}

/** Re-renders as text extraction progresses; read fields off `text` directly. */
export function useDocProgress(text: DocText) {
    return useSyncExternalStore(text.subscribe, text.getVersion);
}

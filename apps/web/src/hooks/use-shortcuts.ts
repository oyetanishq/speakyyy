import { useEffect } from "react";
import { narrator } from "@/lib/speech/narrator";
import { clampRate, updateSettings } from "@/lib/storage/settings";

function isTyping(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.closest("dialog[open]") !== null;
}

const nudgeRate = (delta: number) =>
    updateSettings((s) => ({ ...s, speech: { ...s.speech, rate: clampRate(s.speech.rate + delta) } }));

/**
 * Space  play / pause
 * ← / →  previous / next sentence
 * [ / ]  slower / faster
 */
export function useShortcuts(enabled: boolean) {
    useEffect(() => {
        if (!enabled) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
            switch (e.key) {
                case " ":
                    // A focused button would also "click" on keyup.
                    if (e.target instanceof HTMLButtonElement) e.target.blur();
                    narrator.toggle();
                    break;
                case "ArrowRight":
                    narrator.next();
                    break;
                case "ArrowLeft":
                    narrator.prev();
                    break;
                case "]":
                    nudgeRate(0.1);
                    break;
                case "[":
                    nudgeRate(-0.1);
                    break;
                default:
                    return;
            }
            e.preventDefault();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [enabled]);
}

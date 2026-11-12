import { useVoices } from "@/hooks/use-stores";
import { useActiveVoice } from "@/hooks/use-active-voice";
import { updateSettings } from "@/lib/storage/settings";

const label = (v: SpeechSynthesisVoice) => `${v.name} (${v.lang})`;

/** Your language first (macOS alone ships ~180 voices), then by name. */
function sortVoices(list: SpeechSynthesisVoice[]) {
    const base = navigator.language.split("-")[0].toLowerCase();
    const rank = (v: SpeechSynthesisVoice) => (v.lang.toLowerCase().startsWith(base) ? 0 : 1);
    return list.toSorted((a, b) => rank(a) - rank(b) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name));
}

export default function VoicePicker() {
    const voices = useVoices();
    const active = useActiveVoice();
    const local = sortVoices(voices.filter((v) => v.localService));
    const online = sortVoices(voices.filter((v) => !v.localService));

    if (voices.length === 0) {
        return <span className="text-xs text-ink-3">Loading voices…</span>;
    }

    return (
        <label className="flex min-w-0 items-center gap-2 text-xs text-ink-2">
            <span className="sr-only sm:not-sr-only">Voice</span>
            <select
                className="field h-8 w-full min-w-0 max-w-56 py-0 text-sm"
                value={active?.voiceURI ?? ""}
                onChange={(e) => updateSettings((s) => ({ ...s, speech: { ...s.speech, voiceURI: e.target.value } }))}
            >
                {local.length > 0 && (
                    <optgroup label="On this device">
                        {local.map((v) => (
                            <option key={v.voiceURI} value={v.voiceURI}>
                                {label(v)}
                            </option>
                        ))}
                    </optgroup>
                )}
                {online.length > 0 && (
                    <optgroup label="Online (cursor is approximate)">
                        {online.map((v) => (
                            <option key={v.voiceURI} value={v.voiceURI}>
                                {label(v)}
                            </option>
                        ))}
                    </optgroup>
                )}
            </select>
        </label>
    );
}

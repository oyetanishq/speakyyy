import { useEffect } from "react";
import { useActiveVoice } from "@/hooks/use-active-voice";
import { usePhononCatalog } from "@/hooks/use-stores";
import { BUNDLED_VOICE, DEFAULT_VOICE, DEFAULT_VOICE_LABEL, loadCatalog, type CatalogVoice } from "@/lib/speech/phonon";
import { updateSettings } from "@/lib/storage/settings";

const label = (v: CatalogVoice) => (/^(male|female)$/i.test(v.gender) ? `${v.name} · ${v.gender.toLowerCase()}` : v.name);

export default function VoicePicker() {
    const active = useActiveVoice();
    const catalog = usePhononCatalog();

    useEffect(() => {
        void loadCatalog();
    }, []);

    return (
        <label className="flex min-w-0 items-center gap-2 text-xs text-ink-2">
            <span className="sr-only sm:not-sr-only">Voice</span>
            <select
                className="field h-8 w-full min-w-0 max-w-60 py-0 text-sm"
                value={active}
                title={catalog.find((v) => v.id === active)?.description}
                onChange={(e) =>
                    updateSettings((s) => ({
                        ...s,
                        speech: { ...s.speech, voice: e.target.value === DEFAULT_VOICE ? null : e.target.value },
                    }))
                }
            >
                {/* Until the catalog arrives, the default still needs an option to show. */}
                {!catalog.some((v) => v.id === DEFAULT_VOICE) && <option value={DEFAULT_VOICE}>{DEFAULT_VOICE_LABEL}</option>}
                {catalog.map((v) => (
                    <option key={v.id} value={v.id} title={v.description}>
                        {label(v)}
                    </option>
                ))}
                <option value={BUNDLED_VOICE}>Phonon original</option>
            </select>
        </label>
    );
}

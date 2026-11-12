import { useSettings } from "@/hooks/use-stores";
import { clampRate, RATE_MAX, RATE_MIN, updateSettings } from "@/lib/storage/settings";

export default function SpeedControl() {
    const { rate } = useSettings().speech;
    return (
        <label className="flex items-center gap-2 text-xs text-ink-2" title="Speed ( [ and ] )">
            <span className="sr-only sm:not-sr-only">Speed</span>
            <input
                type="range"
                min={RATE_MIN}
                max={RATE_MAX}
                step={0.05}
                value={rate}
                onChange={(e) =>
                    updateSettings((s) => ({ ...s, speech: { ...s.speech, rate: clampRate(Number(e.target.value)) } }))
                }
                className="w-24 accent-accent"
            />
            <span className="w-10 font-mono tabular-nums text-ink">{rate.toFixed(2)}×</span>
        </label>
    );
}

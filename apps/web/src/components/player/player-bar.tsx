import SpeedControl from "@/components/player/speed-control";
import VoicePicker from "@/components/player/voice-picker";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "@/components/ui/icons";
import { useDocProgress, useNarrator, usePhononStatus } from "@/hooks/use-stores";
import type { LoadedDoc } from "@/hooks/use-reader";
import { narrator } from "@/lib/speech/narrator";
import { loadPhonon } from "@/lib/speech/phonon";

export default function PlayerBar({ doc }: { doc: LoadedDoc }) {
    useDocProgress(doc.text);
    const state = useNarrator();
    const phonon = usePhononStatus();
    const { sentences, done, loadedPages, numPages } = doc.text;
    const playing = state.status === "playing";
    const current = sentences[Math.min(state.sentence, sentences.length - 1)];
    const page = current ? current.page + 1 : 1;
    const progress = done
        ? sentences.length
            ? Math.min(state.sentence + 1, sentences.length) / sentences.length
            : 0
        : (page - 1) / numPages;
    const canPlay = narrator.supported && phonon.kind !== "error" && (sentences.length > 0 || !done);

    return (
        <footer className="border-t border-line bg-paper-2">
            <div className="h-1 bg-line" aria-hidden="true">
                <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        className="icon-btn size-9"
                        onClick={() => narrator.prev()}
                        disabled={!canPlay}
                        aria-label="Previous sentence"
                        title="Previous sentence (←)"
                    >
                        <PrevIcon />
                    </button>
                    <button
                        type="button"
                        className="relative flex size-11 items-center justify-center rounded-full bg-accent text-accent-ink shadow-sm transition hover:brightness-110 active:scale-95 disabled:opacity-40"
                        onClick={() => narrator.toggle()}
                        disabled={!canPlay}
                        aria-label={playing ? "Pause" : "Play"}
                        title={playing ? "Pause (Space)" : "Play (Space)"}
                    >
                        {playing ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
                        {playing && state.buffering && (
                            <span
                                className="absolute -inset-1 animate-spin rounded-full border-2 border-transparent border-t-accent"
                                aria-hidden="true"
                            />
                        )}
                    </button>
                    <button
                        type="button"
                        className="icon-btn size-9"
                        onClick={() => narrator.next()}
                        disabled={!canPlay}
                        aria-label="Next sentence"
                        title="Next sentence (→)"
                    >
                        <NextIcon />
                    </button>
                </div>

                <div className="min-w-0 flex-1 text-sm">
                    <div className="font-medium tabular-nums">
                        Page {page} <span className="text-ink-3">of {numPages}</span>
                    </div>
                    <div className="truncate text-xs text-ink-3 tabular-nums">
                        {done
                            ? `Sentence ${Math.min(state.sentence + 1, sentences.length)} of ${sentences.length}`
                            : `Preparing text… ${loadedPages}/${numPages} pages`}
                        {phonon.kind === "loading" && (
                            <span className="ml-2 text-accent">
                                {phonon.total
                                    ? `Downloading voice model ${Math.round(phonon.loaded / 1e6)} / ${Math.round(phonon.total / 1e6)} MB (once)`
                                    : "Loading voice…"}
                            </span>
                        )}
                    </div>
                    {state.error && <div className="text-xs text-danger">{state.error}</div>}
                    {phonon.kind === "error" && (
                        <div className="flex items-center gap-2 text-xs text-danger">
                            <span className="truncate" title={phonon.message}>
                                Voice model couldn't load: {phonon.message}
                            </span>
                            <button
                                type="button"
                                className="shrink-0 font-medium underline underline-offset-2"
                                onClick={() => void loadPhonon().catch(() => {})}
                            >
                                Retry
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
                    <SpeedControl />
                    <VoicePicker />
                </div>
            </div>
        </footer>
    );
}

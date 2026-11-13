import { useEffect, useState } from "react";
import EmptyState from "@/components/chrome/empty-state";
import ModeSwitch, { type Mode } from "@/components/chrome/mode-switch";
import TopBar from "@/components/chrome/top-bar";
import PlayerBar from "@/components/player/player-bar";
import SettingsDialog from "@/components/settings/settings-dialog";
import { XIcon } from "@/components/ui/icons";
import PdfViewer from "@/components/viewer/pdf-viewer";
import { useActiveVoice } from "@/hooks/use-active-voice";
import { useFileDrop } from "@/hooks/use-file-drop";
import { useReader } from "@/hooks/use-reader";
import { useShortcuts } from "@/hooks/use-shortcuts";
import { useSettings } from "@/hooks/use-stores";
import { narrator } from "@/lib/speech/narrator";
import { prepareVoice } from "@/lib/speech/phonon";

/**
 * Single screen, no router: top bar, the PDF, and the player. The narrator and
 * settings are module-level stores (see hooks/use-stores.ts), so nothing here
 * needs a context provider.
 */
export default function App() {
    const { doc, status, openFile, dismissError } = useReader();
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [mode, setMode] = useState<Mode>("read");
    const dragging = useFileDrop(openFile);
    useShortcuts(doc !== null && !settingsOpen);

    // Push voice + speed into the narrator (it restarts the sentence if playing).
    const voice = useActiveVoice();
    const { rate } = useSettings().speech;
    useEffect(() => narrator.setVoice(voice), [voice]);
    useEffect(() => narrator.setRate(rate), [rate]);
    // Warm the model and the chosen voice up front: a one-time ~65 MB download,
    // then < 1 s from the browser cache. Failure shows in the player bar (Retry).
    useEffect(() => {
        if (narrator.supported) prepareVoice(voice).catch(() => {});
    }, [voice]);

    return (
        <div className="flex h-dvh flex-col">
            <TopBar
                fileName={doc?.name ?? null}
                mode={mode}
                onModeChange={setMode}
                onOpenFile={openFile}
                onOpenSettings={() => setSettingsOpen(true)}
            />
            <div className="border-b border-line bg-paper px-4 py-2 sm:hidden">
                <ModeSwitch mode={mode} onChange={setMode} />
            </div>

            {!narrator.supported && (
                <div className="bg-warn-bg px-4 py-2 text-sm text-warn-ink">
                    This browser can't run the voice model (it needs Web Workers and WebAssembly), so PDFs can be viewed but not read aloud.
                </div>
            )}
            {status.kind === "error" && (
                <div role="alert" className="flex items-center gap-3 bg-danger px-4 py-2 text-sm text-white">
                    <span className="flex-1">{status.message}</span>
                    <button type="button" onClick={dismissError} aria-label="Dismiss" className="opacity-80 hover:opacity-100">
                        <XIcon size={16} />
                    </button>
                </div>
            )}

            <main className="relative min-h-0 flex-1">
                {doc ? (
                    <PdfViewer key={doc.id} doc={doc} />
                ) : (
                    <EmptyState loadingName={status.kind === "loading" ? status.name : null} onOpenFile={openFile} />
                )}
            </main>

            {doc && <PlayerBar doc={doc} />}

            <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />

            {dragging && (
                <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-accent/15 backdrop-blur-[2px]">
                    <div className="rounded-2xl border-2 border-dashed border-accent bg-paper px-8 py-6 text-lg font-medium shadow-xl">
                        Drop the PDF to open it
                    </div>
                </div>
            )}
        </div>
    );
}

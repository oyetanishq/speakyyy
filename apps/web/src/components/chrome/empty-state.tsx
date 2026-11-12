import UploadButton from "@/components/chrome/upload-button";
import { FileIcon } from "@/components/ui/icons";

type Props = { loadingName: string | null; onOpenFile: (file: File) => void };

export default function EmptyState({ loadingName, onOpenFile }: Props) {
    return (
        <div className="flex h-full items-center justify-center bg-stage p-6">
            <div className="w-full max-w-md rounded-2xl border border-dashed border-ink-3/50 bg-paper px-8 py-12 text-center">
                {loadingName ? (
                    <>
                        <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-line border-t-accent" />
                        <p className="truncate text-sm text-ink-2">Opening {loadingName}…</p>
                    </>
                ) : (
                    <>
                        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
                            <FileIcon size={22} />
                        </div>
                        <h1 className="text-lg font-semibold">Open a PDF to listen to it</h1>
                        <p className="mt-1 text-sm text-ink-2">Drop it anywhere on the page, or pick a file. It stays in this browser.</p>
                        <UploadButton onFile={onOpenFile} className="btn btn-primary mt-6">
                            Choose PDF
                        </UploadButton>
                        <p className="mt-6 text-xs text-ink-3">
                            <kbd>Space</kbd> play/pause · <kbd>←</kbd> <kbd>→</kbd> sentence · <kbd>[</kbd> <kbd>]</kbd> speed · click
                            a word to read from there
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}

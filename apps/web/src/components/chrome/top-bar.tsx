import ModeSwitch, { type Mode } from "@/components/chrome/mode-switch";
import UploadButton from "@/components/chrome/upload-button";
import { FileIcon, GearIcon } from "@/components/ui/icons";

type Props = {
    fileName: string | null;
    mode: Mode;
    onModeChange: (m: Mode) => void;
    onOpenFile: (file: File) => void;
    onOpenSettings: () => void;
};

export default function TopBar({ fileName, mode, onModeChange, onOpenFile, onOpenSettings }: Props) {
    return (
        <header className="flex items-center gap-3 border-b border-line bg-paper px-4 py-2.5">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="shrink-0 font-semibold tracking-tight">
                    pdf<span className="text-accent">·</span>speak
                </span>
                {fileName && (
                    <span className="truncate text-sm text-ink-2" title={fileName}>
                        {fileName}
                    </span>
                )}
            </div>
            <div className="hidden sm:block">
                <ModeSwitch mode={mode} onChange={onModeChange} />
            </div>
            <UploadButton onFile={onOpenFile} className="btn">
                <FileIcon size={16} />
                <span className="hidden sm:inline">Open PDF</span>
            </UploadButton>
            <button type="button" className="icon-btn size-9" onClick={onOpenSettings} aria-label="Settings" title="Settings">
                <GearIcon />
            </button>
        </header>
    );
}

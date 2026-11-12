import { useRef, type ReactNode } from "react";

type Props = { onFile: (file: File) => void; className?: string; children: ReactNode };

export default function UploadButton({ onFile, className, children }: Props) {
    const input = useRef<HTMLInputElement>(null);
    return (
        <>
            <button type="button" className={className} onClick={() => input.current?.click()}>
                {children}
            </button>
            <input
                ref={input}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onFile(file);
                    e.target.value = ""; // allow re-picking the same file
                }}
            />
        </>
    );
}

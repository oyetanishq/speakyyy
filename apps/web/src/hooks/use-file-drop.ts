import { useEffect, useState } from "react";

const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;

/** Drop a PDF anywhere on the window. Returns whether a drag is in progress. */
export function useFileDrop(onFile: (file: File) => void) {
    const [dragging, setDragging] = useState(false);

    useEffect(() => {
        let depth = 0;
        const enter = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            depth++;
            setDragging(true);
        };
        const leave = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            depth = Math.max(0, depth - 1);
            if (depth === 0) setDragging(false);
        };
        const over = (e: DragEvent) => {
            if (hasFiles(e)) e.preventDefault();
        };
        const drop = (e: DragEvent) => {
            if (!hasFiles(e)) return;
            e.preventDefault();
            depth = 0;
            setDragging(false);
            const file = [...(e.dataTransfer?.files ?? [])].find(
                (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
            );
            if (file) onFile(file);
        };
        window.addEventListener("dragenter", enter);
        window.addEventListener("dragleave", leave);
        window.addEventListener("dragover", over);
        window.addEventListener("drop", drop);
        return () => {
            window.removeEventListener("dragenter", enter);
            window.removeEventListener("dragleave", leave);
            window.removeEventListener("dragover", over);
            window.removeEventListener("drop", drop);
        };
    }, [onFile]);

    return dragging;
}

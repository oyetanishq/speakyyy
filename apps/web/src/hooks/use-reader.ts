import { useCallback, useEffect, useRef, useState } from "react";
import { describePdfError, openPdf, type PDFDocumentProxy } from "@/lib/pdf/load";
import { DocText } from "@/lib/pdf/text-model";
import { narrator } from "@/lib/speech/narrator";
import { docIdOf, loadLastPdf, loadPosition, saveLastPdf, savePosition } from "@/lib/storage/library";

export type LoadedDoc = { id: string; name: string; pdf: PDFDocumentProxy; text: DocText; destroy: () => void };

type Status = { kind: "idle" } | { kind: "loading"; name: string } | { kind: "error"; message: string };

/**
 * Owns the open document: loading, teardown of the previous one, reopening the
 * last PDF on startup, and saving/restoring the reading position.
 */
export function useReader() {
    const [doc, setDoc] = useState<LoadedDoc | null>(null);
    const [status, setStatus] = useState<Status>({ kind: "idle" });
    const current = useRef<LoadedDoc | null>(null);
    const token = useRef(0);

    const load = useCallback(async (file: Blob, name: string, id: string, persist: boolean) => {
        const mine = ++token.current;
        const stale = () => mine !== token.current;

        narrator.setDoc(null);
        const prev = current.current;
        current.current = null;
        setDoc(null);
        prev?.text.destroy();
        prev?.destroy();
        setStatus({ kind: "loading", name });

        let destroy: (() => void) | null = null;
        try {
            const opened = await openPdf(await file.arrayBuffer());
            destroy = opened.destroy;
            if (stale()) return destroy();
            const text = await DocText.create(opened.pdf);
            if (stale()) {
                text.destroy();
                return destroy();
            }
            const next = { id, name, pdf: opened.pdf, text, destroy };
            current.current = next;
            narrator.setDoc(text);
            setDoc(next);
            setStatus({ kind: "idle" });
            if (persist) void saveLastPdf(id, name, file);

            const anchor = await loadPosition(id);
            if (!anchor || stale()) return;
            const index = await text.findAnchor(anchor);
            if (!stale() && narrator.getState().status === "idle" && narrator.getState().sentence === 0) {
                narrator.seek(index, 0, { play: false });
            }
        } catch (err) {
            if (stale()) return;
            destroy?.();
            setStatus({ kind: "error", message: describePdfError(err) });
        }
    }, []);

    const openFile = useCallback((file: File) => load(file, file.name, docIdOf(file), true), [load]);

    // Reopen whatever was open last time.
    useEffect(() => {
        let cancelled = false;
        void loadLastPdf().then((stored) => {
            if (stored && !cancelled && !current.current) void load(stored.file, stored.name, stored.id, false);
        });
        return () => {
            cancelled = true;
        };
    }, [load]);

    // Save the position whenever the reader moves to another sentence.
    useEffect(() => {
        if (!doc) return;
        let last = -1;
        let timer: ReturnType<typeof setTimeout> | null = null;
        const unsubscribe = narrator.subscribe(() => {
            const { sentence } = narrator.getState();
            if (sentence === last) return;
            last = sentence;
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                const anchor = doc.text.anchorOf(sentence);
                if (anchor) void savePosition(doc.id, anchor);
            }, 400);
        });
        return () => {
            unsubscribe();
            if (timer) clearTimeout(timer);
        };
    }, [doc]);

    return { doc, status, openFile, dismissError: () => setStatus({ kind: "idle" }) };
}

import { del, get, set } from "idb-keyval";
import type { Anchor } from "@/lib/pdf/text-model";

/**
 * IndexedDB: the last opened PDF (one only, to keep storage bounded) and a
 * reading position per document. Every call swallows errors - private windows
 * and blocked storage just mean nothing is remembered.
 */
type StoredPdf = { id: string; name: string; file: Blob; savedAt: number };

const LAST_PDF = "last-pdf";
const posKey = (id: string) => `pos:${id}`;

export function docIdOf(file: File) {
    return `${file.name}:${file.size}:${file.lastModified}`;
}

export async function saveLastPdf(id: string, name: string, file: Blob) {
    try {
        await set(LAST_PDF, { id, name, file, savedAt: Date.now() } satisfies StoredPdf);
    } catch (err) {
        console.warn("Couldn't store the PDF for next time", err);
    }
}

export async function loadLastPdf(): Promise<StoredPdf | undefined> {
    try {
        return await get<StoredPdf>(LAST_PDF);
    } catch {
        return undefined;
    }
}

export async function forgetLastPdf() {
    try {
        await del(LAST_PDF);
    } catch {
        // ignore
    }
}

export async function savePosition(id: string, anchor: Anchor) {
    try {
        await set(posKey(id), anchor);
    } catch {
        // ignore
    }
}

export async function loadPosition(id: string): Promise<Anchor | undefined> {
    try {
        return await get<Anchor>(posKey(id));
    } catch {
        return undefined;
    }
}

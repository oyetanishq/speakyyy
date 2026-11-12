/**
 * The ONLY module that imports pdfjs-dist (enforced by .oxlintrc.json), so the
 * worker is always configured before any document is opened.
 */
import {
    AbortException,
    getDocument,
    GlobalWorkerOptions,
    PasswordException,
    RenderingCancelledException,
    TextLayer,
} from "pdfjs-dist";
// oxlint-disable-next-line import/default -- Vite's ?url suffix, typed by vite/client
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export type { PDFDocumentProxy, PDFPageProxy, PageViewport, RenderTask } from "pdfjs-dist";
export type { TextContent, TextItem } from "pdfjs-dist/types/src/display/api";
export { TextLayer };

GlobalWorkerOptions.workerSrc = workerUrl;

// cmaps / standard fonts / wasm decoders are copied to <base>/pdfjs/ by the
// pdfjsAssets plugin in vite.config.ts. Absolute URLs, because the worker
// resolves relative ones against its own script location.
const assetBase = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href).href;

/**
 * Opens a PDF. `destroy` frees the worker-side document; in pdf.js v6 that
 * lives on the loading task, not on the document proxy.
 */
export async function openPdf(data: ArrayBuffer) {
    const task = getDocument({
        data,
        cMapUrl: `${assetBase}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${assetBase}standard_fonts/`,
        wasmUrl: `${assetBase}wasm/`,
        iccUrl: `${assetBase}iccs/`,
    });
    const destroy = () => void task.destroy();
    try {
        return { pdf: await task.promise, destroy };
    } catch (err) {
        destroy();
        throw err;
    }
}

/** Errors that just mean "a render/text task was superseded" - never shown. */
export function isCancellation(err: unknown): boolean {
    return err instanceof RenderingCancelledException || err instanceof AbortException;
}

export function describePdfError(err: unknown): string {
    if (err instanceof PasswordException) return "Password-protected PDFs aren't supported yet.";
    if (err instanceof Error && err.name === "InvalidPDFException") return "That file isn't a valid PDF.";
    return err instanceof Error ? err.message : "Couldn't open that PDF.";
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { FollowTracker } from "@/components/viewer/follow";
import PdfPage from "@/components/viewer/pdf-page";
import { MinusIcon, PlusIcon } from "@/components/ui/icons";
import { useDocProgress, useNarrator } from "@/hooks/use-stores";
import type { LoadedDoc } from "@/hooks/use-reader";
import { narrator } from "@/lib/speech/narrator";

const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3];
/** Pages never get wider than this at zoom 1, however wide the window. */
const MAX_FIT_WIDTH = 920;
const GUTTER = 32;

export default function PdfViewer({ doc }: { doc: LoadedDoc }) {
    useDocProgress(doc.text);
    const { sentence, word } = useNarrator();
    const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
    const [available, setAvailable] = useState(0);
    const [zoomIndex, setZoomIndex] = useState(ZOOM_STEPS.indexOf(1));
    const [follow] = useState(() => new FollowTracker());

    useEffect(() => {
        if (!scroller) return;
        const ro = new ResizeObserver(() => setAvailable(scroller.clientWidth));
        ro.observe(scroller);
        return () => ro.disconnect();
    }, [scroller]);

    const zoom = ZOOM_STEPS[zoomIndex];
    const fit = available ? Math.min(available - GUTTER, MAX_FIT_WIDTH) / doc.text.pageSize(0).width : 1;
    const scale = Math.max(0.2, Math.round(fit * zoom * 1000) / 1000);

    // Keep roughly the same spot in view when zooming.
    const lastScale = useRef(scale);
    useLayoutEffect(() => {
        const ratio = scale / lastScale.current;
        lastScale.current = scale;
        if (!scroller || ratio === 1) return;
        scroller.scrollTo({ top: scroller.scrollTop * ratio, left: scroller.scrollLeft * ratio });
    }, [scale, scroller]);

    // When reading moves onto a page whose text layer isn't rendered (far off
    // screen), bring the page in; its HighlightLayer then centres the word.
    useEffect(() => {
        if (!scroller) return;
        const s = doc.text.sentences[sentence];
        if (!s || follow.has(`${sentence}:${word}`)) return;
        const page = s.words[word ?? 0]?.segs[0]?.page ?? s.page;
        const el = scroller.querySelector<HTMLElement>(`[data-page="${page}"]`);
        if (el && el.dataset.textReady !== "true") el.scrollIntoView({ block: "start" });
    }, [doc, sentence, word, scroller, follow]);

    const onWordClick = useCallback(
        (page: number, item: number, offset: number) => {
            const hit = doc.text.findWord(page, item, offset);
            if (hit) narrator.seek(hit.sentence, hit.word, { play: true });
        },
        [doc],
    );

    const { done, loadedPages, numPages } = doc.text;
    const noText = done && doc.text.sentences.length === 0;

    return (
        <div className="absolute inset-0">
            <div ref={setScroller} className="absolute inset-0 overflow-auto bg-stage">
                <div className="mx-auto flex w-max min-w-full flex-col items-center gap-4 px-4 py-6">
                    {scroller &&
                        Array.from({ length: numPages }, (_, i) => (
                            <PdfPage
                                key={i}
                                doc={doc}
                                index={i}
                                pageWidth={doc.text.pageSize(i).width}
                                pageHeight={doc.text.pageSize(i).height}
                                scale={scale}
                                scroller={scroller}
                                follow={follow}
                                onWordClick={onWordClick}
                            />
                        ))}
                </div>
            </div>

            {!done && (
                <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-line" aria-hidden="true">
                    <div className="h-full bg-accent transition-[width]" style={{ width: `${(loadedPages / numPages) * 100}%` }} />
                </div>
            )}

            {noText && (
                <div className="absolute inset-x-0 top-4 mx-auto w-fit max-w-[90%] rounded-lg bg-warn-bg px-4 py-2 text-sm text-warn-ink shadow">
                    No selectable text in this PDF. It's probably scanned images, and OCR isn't supported yet.
                </div>
            )}

            <div className="absolute right-4 top-3 flex items-center gap-1 rounded-full border border-line bg-paper/90 p-1 text-sm shadow-sm backdrop-blur">
                <button
                    type="button"
                    className="icon-btn size-7"
                    onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
                    disabled={zoomIndex === 0}
                    aria-label="Zoom out"
                >
                    <MinusIcon size={16} />
                </button>
                <button
                    type="button"
                    className="min-w-12 rounded-full px-1 font-mono text-xs tabular-nums text-ink-2 hover:text-ink"
                    onClick={() => setZoomIndex(ZOOM_STEPS.indexOf(1))}
                    title="Fit width"
                >
                    {Math.round(zoom * 100)}%
                </button>
                <button
                    type="button"
                    className="icon-btn size-7"
                    onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}
                    disabled={zoomIndex === ZOOM_STEPS.length - 1}
                    aria-label="Zoom in"
                >
                    <PlusIcon size={16} />
                </button>
            </div>
        </div>
    );
}

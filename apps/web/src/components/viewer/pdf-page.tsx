import { memo, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import type { FollowTracker } from "@/components/viewer/follow";
import HighlightLayer from "@/components/viewer/highlight-layer";
import { useNearViewport } from "@/hooks/use-near-viewport";
import type { LoadedDoc } from "@/hooks/use-reader";
import { isCancellation, TextLayer, type RenderTask } from "@/lib/pdf/load";

type Props = {
    doc: LoadedDoc;
    index: number;
    /** Page size at scale 1 (the viewer re-reads it as parsing reveals it). */
    pageWidth: number;
    pageHeight: number;
    scale: number;
    scroller: HTMLElement;
    follow: FollowTracker;
    onWordClick: (page: number, item: number, offset: number) => void;
};

/** Canvas backing store cap (~16.7 MP) so deep zoom can't exhaust memory. */
const MAX_CANVAS_PIXELS = 4096 * 4096;

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
    if (document.caretPositionFromPoint) {
        const p = document.caretPositionFromPoint(x, y);
        return p ? { node: p.offsetNode, offset: p.offset } : null;
    }
    // Safari < 18.4
    const r = document.caretRangeFromPoint?.(x, y);
    return r ? { node: r.startContainer, offset: r.startOffset } : null;
}

function PdfPage({ doc, index, pageWidth, pageHeight, scale, scroller, follow, onWordClick }: Props) {
    const width = Math.floor(pageWidth * scale);
    const height = Math.floor(pageHeight * scale);

    const pageRef = useRef<HTMLDivElement>(null);
    const canvasHolder = useRef<HTMLDivElement>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const near = useNearViewport(pageRef, scroller);
    // Spans of the last rendered text layer, tagged with what they were
    // rendered for; stale ones (other scale/doc, or page scrolled away) are
    // ignored rather than cleared, so the effect never sets state synchronously.
    const [rendered, setRendered] = useState<{ divs: HTMLElement[]; scale: number; doc: LoadedDoc } | null>(null);
    const textDivs = near && rendered?.scale === scale && rendered.doc === doc ? rendered.divs : null;

    useEffect(() => {
        const holder = canvasHolder.current;
        const textEl = textRef.current;
        if (!holder || !textEl) return;
        if (!near) {
            holder.replaceChildren();
            textEl.replaceChildren();
            return;
        }

        let cancelled = false;
        let renderTask: RenderTask | null = null;
        let textLayer: TextLayer | null = null;

        (async () => {
            const page = await doc.pdf.getPage(index + 1);
            if (cancelled) return;
            const viewport = page.getViewport({ scale });

            // Text layer first: it's what the highlight and click-to-read need.
            const textTask = (async () => {
                const content = await doc.text.getTextContent(index);
                if (cancelled) return;
                const fresh = document.createElement("div");
                textLayer = new TextLayer({ textContentSource: content, container: fresh, viewport });
                await textLayer.render();
                if (cancelled) return;
                // TextLayer sized `fresh` and set the browser's minimum font
                // size on it; only the latter matters to the spans we move.
                textEl.style.setProperty("--min-font-size", fresh.style.getPropertyValue("--min-font-size"));
                textEl.replaceChildren(...fresh.childNodes);
                setRendered({ divs: textLayer.textDivs, scale, doc });
            })();

            // Render into a detached canvas and swap it in, so zooming never
            // flashes an empty page.
            const dpr = Math.min(window.devicePixelRatio || 1, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));
            const canvas = document.createElement("canvas");
            canvas.width = Math.floor(viewport.width * dpr);
            canvas.height = Math.floor(viewport.height * dpr);
            canvas.className = "block h-full w-full";
            renderTask = page.render({
                canvas,
                viewport,
                transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
            });
            await renderTask.promise;
            if (!cancelled) holder.replaceChildren(canvas);
            await textTask;
        })().catch((err: unknown) => {
            if (!cancelled && !isCancellation(err)) console.error(`Page ${index + 1} failed to render`, err);
        });

        return () => {
            cancelled = true;
            renderTask?.cancel();
            textLayer?.cancel();
        };
    }, [near, scale, doc, index]);

    const onClick = (e: MouseEvent) => {
        if (!textDivs || !window.getSelection()?.isCollapsed) return;
        const hit = caretAt(e.clientX, e.clientY);
        const span = hit?.node.parentElement;
        if (!hit || !span) return;
        const item = textDivs.indexOf(span);
        if (item >= 0) onWordClick(index, item, hit.offset);
    };

    const style = {
        width,
        height,
        "--total-scale-factor": scale,
        "--scale-round-x": "1px",
        "--scale-round-y": "1px",
    } as CSSProperties;

    return (
        <div
            ref={pageRef}
            data-page={index}
            data-text-ready={textDivs ? "true" : undefined}
            className="relative isolate shrink-0 bg-white shadow-page"
            style={style}
        >
            <div ref={canvasHolder} className="absolute inset-0 z-0" />
            {textDivs && (
                <HighlightLayer
                    text={doc.text}
                    page={index}
                    textDivs={textDivs}
                    pageRef={pageRef}
                    scroller={scroller}
                    follow={follow}
                />
            )}
            {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- pointer shortcut; the keyboard has ←/→ */}
            <div ref={textRef} className="textLayer z-[2]" onClick={onClick} />
        </div>
    );
}

export default memo(PdfPage);

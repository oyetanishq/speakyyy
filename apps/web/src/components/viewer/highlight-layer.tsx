import { useLayoutEffect, useState, type RefObject } from "react";
import type { FollowTracker } from "@/components/viewer/follow";
import { useNarrator } from "@/hooks/use-stores";
import type { DocText, Seg } from "@/lib/pdf/text-model";

type Box = { x: number; y: number; w: number; h: number };
type Boxes = { sentence: Box[]; word: Box[] };

const EMPTY: Boxes = { sentence: [], word: [] };

type Props = {
    text: DocText;
    page: number;
    /** pdf.js TextLayer spans, index-aligned with the page's text items. */
    textDivs: HTMLElement[];
    pageRef: RefObject<HTMLDivElement | null>;
    scroller: HTMLElement;
    follow: FollowTracker;
};

function rectsFor(segs: Seg[], page: number, textDivs: HTMLElement[], range: Range): DOMRect[] {
    const out: DOMRect[] = [];
    for (const seg of segs) {
        if (seg.page !== page) continue;
        const node = textDivs[seg.item]?.firstChild;
        if (!(node instanceof Text)) continue;
        const len = node.length;
        range.setStart(node, Math.min(seg.start, len));
        range.setEnd(node, Math.min(seg.end, len));
        for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) out.push(r);
    }
    return out;
}

/** Join word boxes that sit on the same line into one continuous band. */
function mergeLines(rects: DOMRect[]): DOMRect[] {
    const out: DOMRect[] = [];
    for (const r of rects) {
        const last = out.at(-1);
        if (last) {
            const overlap = Math.min(last.bottom, r.bottom) - Math.max(last.top, r.top);
            const h = Math.min(last.height, r.height);
            const gap = r.left - last.right;
            if (overlap > h * 0.5 && gap < h * 0.9 && r.left >= last.left - 1) {
                const top = Math.min(last.top, r.top);
                const bottom = Math.max(last.bottom, r.bottom);
                out[out.length - 1] = new DOMRect(last.left, top, Math.max(last.right, r.right) - last.left, bottom - top);
                continue;
            }
        }
        out.push(r);
    }
    return out;
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Scroll the word into the comfortable middle band of the viewer if needed. */
function ensureVisible(scroller: HTMLElement, rects: DOMRect[]) {
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    const left = Math.min(...rects.map((r) => r.left));
    const right = Math.max(...rects.map((r) => r.right));
    const sc = scroller.getBoundingClientRect();
    let dy = 0;
    let dx = 0;
    if (top < sc.top + 48 || bottom > sc.bottom - 64) dy = top - (sc.top + sc.height * 0.35);
    if (left < sc.left + 12) dx = left - sc.left - 32;
    else if (right > sc.right - 12) dx = right - sc.right + 32;
    if (dx || dy) scroller.scrollBy({ top: dy, left: dx, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

export default function HighlightLayer({ text, page, textDivs, pageRef, scroller, follow }: Props) {
    const { sentence: si, word: wi } = useNarrator();
    const [boxes, setBoxes] = useState<Boxes>(EMPTY);

    useLayoutEffect(() => {
        const sentence = text.sentences[si];
        const pageEl = pageRef.current;
        const touchesPage = sentence?.words.some((w) => w.segs.some((s) => s.page === page));
        if (!sentence || !pageEl || !touchesPage) {
            setBoxes((b) => (b === EMPTY ? b : EMPTY));
            return;
        }

        const range = document.createRange();
        const all: DOMRect[] = [];
        let current: DOMRect[] = [];
        sentence.words.forEach((w, i) => {
            const rects = rectsFor(w.segs, page, textDivs, range);
            all.push(...rects);
            if (i === wi) current = rects;
        });

        const origin = pageEl.getBoundingClientRect();
        const rel = (r: DOMRect): Box => ({ x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height });
        setBoxes({ sentence: mergeLines(all).map(rel), word: mergeLines(current).map(rel) });

        if (current.length > 0 && follow.claim(`${si}:${wi}`)) ensureVisible(scroller, current);
    }, [text, page, textDivs, si, wi, pageRef, scroller, follow]);

    if (boxes === EMPTY) return null;
    return (
        <div className="pointer-events-none absolute inset-0 z-[1]" aria-hidden="true">
            {boxes.sentence.map((b, i) => (
                <div
                    key={`s${i}`}
                    className="absolute rounded-[3px] bg-sentence mix-blend-multiply"
                    style={{ left: b.x - 2, top: b.y - 1, width: b.w + 4, height: b.h + 2 }}
                />
            ))}
            {/* Keyed by sentence: the box glides word to word within a sentence
                but never slides across the page when the sentence changes. */}
            {boxes.word.map((b, i) => (
                <div
                    key={`w${si}-${i}`}
                    className="absolute rounded-[3px] bg-word mix-blend-multiply transition-[left,top,width,height] duration-100 ease-out motion-reduce:transition-none"
                    style={{ left: b.x - 2, top: b.y - 1, width: b.w + 4, height: b.h + 2 }}
                />
            ))}
        </div>
    );
}

import { useEffect, useState, type RefObject } from "react";

/**
 * True while the element is within ~1.5 screens of the scroll container's
 * viewport. Pages outside that window drop their canvas and text layer.
 */
export function useNearViewport(ref: RefObject<HTMLElement | null>, root: HTMLElement | null) {
    const [near, setNear] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el || !root) return;
        const io = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
            root,
            rootMargin: "150% 0px",
        });
        io.observe(el);
        return () => io.disconnect();
    }, [ref, root]);
    return near;
}

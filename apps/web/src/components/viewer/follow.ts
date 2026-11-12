/**
 * Remembers which "sentence:word" the viewer last scrolled to, shared by every
 * page's HighlightLayer so a page that re-renders (scrolled back into range,
 * zoom) never yanks the view back to a word it already showed.
 */
export class FollowTracker {
    #key = "";

    has(key: string) {
        return this.#key === key;
    }

    /** True the first time `key` is claimed. */
    claim(key: string) {
        if (this.#key === key) return false;
        this.#key = key;
        return true;
    }
}

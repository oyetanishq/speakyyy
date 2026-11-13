/** The contract between the narrator and the speech engine (phonon.ts). */

export type PlaybackHandlers = {
    /** Audio is actually audible now. */
    onStart: () => void;
    /** The spoken position moved to `charIndex` of the utterance text. */
    onPosition: (charIndex: number) => void;
    onEnd: () => void;
    onError: (message: string) => void;
};

/** One utterance in flight. */
export type Playback = {
    stop: () => void;
    pause: () => void;
    resume: () => void;
    /** Change speed without restarting (pitch is preserved). */
    setRate: (rate: number) => void;
};

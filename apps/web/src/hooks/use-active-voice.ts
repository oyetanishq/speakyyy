import { useSettings } from "@/hooks/use-stores";
import { DEFAULT_VOICE } from "@/lib/speech/phonon";

/** The Phonon voice to speak with: the saved choice, else Russell. */
export function useActiveVoice(): string {
    return useSettings().speech.voice ?? DEFAULT_VOICE;
}

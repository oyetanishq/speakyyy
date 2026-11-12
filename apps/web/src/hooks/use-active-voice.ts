import { useMemo } from "react";
import { useSettings, useVoices } from "@/hooks/use-stores";
import { pickDefaultVoice } from "@/lib/speech/voices";

/** The saved voice if it still exists on this device, else a sensible default. */
export function useActiveVoice(): SpeechSynthesisVoice | null {
    const voices = useVoices();
    const { voiceURI } = useSettings().speech;
    return useMemo(
        () => voices.find((v) => v.voiceURI === voiceURI) ?? pickDefaultVoice(voices),
        [voices, voiceURI],
    );
}

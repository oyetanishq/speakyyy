export type Mode = "read" | "explain";

const MODES: { id: Mode; label: string; ready: boolean; hint: string }[] = [
    { id: "read", label: "Read aloud", ready: true, hint: "Speaks the PDF as written" },
    { id: "explain", label: "Explain", ready: false, hint: "Coming soon: the LLM explains each part as it reads" },
];

export default function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
    return (
        <fieldset className="flex rounded-full border border-line bg-paper-2 p-0.5 text-sm">
            <legend className="sr-only">Mode</legend>
            {MODES.map((m) => (
                <button
                    key={m.id}
                    type="button"
                    aria-pressed={mode === m.id}
                    disabled={!m.ready}
                    title={m.hint}
                    onClick={() => onChange(m.id)}
                    className="rounded-full px-3 py-1 text-ink-2 transition enabled:hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:bg-paper aria-pressed:text-ink aria-pressed:shadow-sm"
                >
                    {m.label}
                    {!m.ready && <span className="ml-1 text-[10px] uppercase tracking-wide">soon</span>}
                </button>
            ))}
        </fieldset>
    );
}

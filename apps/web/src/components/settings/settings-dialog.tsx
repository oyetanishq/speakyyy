import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { EyeIcon, EyeOffIcon, XIcon } from "@/components/ui/icons";
import { listModels } from "@/lib/llm/client";
import { getSettings, updateSettings, type Settings } from "@/lib/storage/settings";

type Test = { kind: "idle" } | { kind: "running" } | { kind: "ok"; count: number } | { kind: "error"; message: string };

export default function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    const [form, setForm] = useState<Settings["llm"]>(getSettings().llm);
    const [showKey, setShowKey] = useState(false);
    const [test, setTest] = useState<Test>({ kind: "idle" });
    const [models, setModels] = useState<string[]>([]);
    const testAbort = useRef<AbortController | null>(null);
    const ids = { base: useId(), model: useId(), key: useId(), list: useId() };

    useEffect(() => {
        const el = dialog.current;
        if (!el) return;
        if (open && !el.open) {
            setForm(getSettings().llm);
            setShowKey(false);
            setTest({ kind: "idle" });
            el.showModal();
        } else if (!open && el.open) {
            el.close();
        }
    }, [open]);

    useEffect(() => () => testAbort.current?.abort(), []);

    const set = (patch: Partial<Settings["llm"]>) => {
        setForm((f) => ({ ...f, ...patch }));
        if (patch.baseUrl !== undefined || patch.apiKey !== undefined) setTest({ kind: "idle" });
    };

    const runTest = async () => {
        testAbort.current?.abort();
        const ctrl = new AbortController();
        testAbort.current = ctrl;
        setTest({ kind: "running" });
        try {
            const list = await listModels(form, ctrl.signal);
            setModels(list);
            setTest({ kind: "ok", count: list.length });
        } catch (err) {
            if (ctrl.signal.aborted) return;
            setTest({ kind: "error", message: err instanceof Error ? err.message : String(err) });
        }
    };

    const save = (e: FormEvent) => {
        e.preventDefault();
        updateSettings((s) => ({
            ...s,
            llm: { baseUrl: form.baseUrl.trim(), model: form.model.trim(), apiKey: form.apiKey.trim() },
        }));
        onClose();
    };

    return (
        <dialog
            ref={dialog}
            onClose={onClose}
            className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-paper p-0 text-ink shadow-xl backdrop:bg-black/40"
        >
            <form onSubmit={save} className="flex flex-col gap-5 p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold">LLM settings</h2>
                        <p className="mt-0.5 text-sm text-ink-2">
                            Any OpenAI-compatible API. Stored only in this browser (localStorage). Used by the upcoming Explain mode.
                        </p>
                    </div>
                    <button type="button" className="icon-btn size-8 shrink-0" onClick={onClose} aria-label="Close">
                        <XIcon />
                    </button>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label htmlFor={ids.base} className="text-sm font-medium">
                        Base URL
                    </label>
                    <input
                        id={ids.base}
                        className="field"
                        type="url"
                        placeholder="https://api.openai.com/v1"
                        value={form.baseUrl}
                        onChange={(e) => set({ baseUrl: e.target.value })}
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label htmlFor={ids.key} className="text-sm font-medium">
                        API key
                    </label>
                    <div className="relative">
                        <input
                            id={ids.key}
                            className="field w-full pr-10 font-mono"
                            type={showKey ? "text" : "password"}
                            placeholder="sk-…"
                            value={form.apiKey}
                            onChange={(e) => set({ apiKey: e.target.value })}
                            autoComplete="off"
                            spellCheck={false}
                        />
                        <button
                            type="button"
                            className="icon-btn absolute right-1 top-1/2 size-8 -translate-y-1/2"
                            onClick={() => setShowKey((v) => !v)}
                            aria-label={showKey ? "Hide key" : "Show key"}
                        >
                            {showKey ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label htmlFor={ids.model} className="text-sm font-medium">
                        Model
                    </label>
                    <input
                        id={ids.model}
                        className="field font-mono"
                        placeholder="gpt-4o-mini"
                        list={ids.list}
                        value={form.model}
                        onChange={(e) => set({ model: e.target.value })}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <datalist id={ids.list}>
                        {models.map((m) => (
                            <option key={m} value={m}>
                                {m}
                            </option>
                        ))}
                    </datalist>
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                    <button
                        type="button"
                        className="btn"
                        onClick={runTest}
                        disabled={!form.baseUrl.trim() || test.kind === "running"}
                    >
                        {test.kind === "running" ? "Testing…" : "Test connection"}
                    </button>
                    <output className="min-w-0 flex-1 text-sm">
                        {test.kind === "ok" && (
                            <span className="text-ok">
                                Connected · {test.count} model{test.count === 1 ? "" : "s"}
                                {test.count > 0 && " (suggested in Model)"}
                            </span>
                        )}
                        {test.kind === "error" && <span className="break-words text-danger">{test.message}</span>}
                    </output>
                    <button type="submit" className="btn btn-primary">
                        Save
                    </button>
                </div>
            </form>
        </dialog>
    );
}

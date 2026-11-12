/**
 * OpenAI-compatible endpoints (OpenAI, OpenRouter, Groq, Together, LM Studio,
 * Ollama's /v1, ...). Only the connection test lives here for now; Mode 2
 * ("explain as it reads") will add the chat call.
 */
export type LlmConfig = { baseUrl: string; apiKey: string };

function endpoint(baseUrl: string, path: string) {
    return `${baseUrl.trim().replace(/\/+$/, "")}${path}`;
}

/** GET /models - proves URL + key work, and gives model ids to suggest. */
export async function listModels({ baseUrl, apiKey }: LlmConfig, signal?: AbortSignal): Promise<string[]> {
    let res: Response;
    try {
        res = await fetch(endpoint(baseUrl, "/models"), {
            headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
            signal,
        });
    } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        throw new Error("Network error. Check the URL, or the server may not allow browser (CORS) requests.", {
            cause: err,
        });
    }
    if (!res.ok) {
        const body = (await res.text().catch(() => "")).slice(0, 200);
        throw new Error(`${res.status} ${res.statusText}${body ? ` - ${body}` : ""}`);
    }
    type ModelEntry = { id?: unknown; name?: unknown };
    const json = (await res.json()) as { data?: ModelEntry[]; models?: ModelEntry[] };
    const list = json.data ?? json.models ?? [];
    return list
        .map((m) => m.id ?? m.name)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
        .toSorted();
}

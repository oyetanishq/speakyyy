import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { cpSync, createReadStream, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";

// pdf.js is ~1 MB and changes on a different cadence than React, so it gets
// its own chunk. Rolldown (Vite 8) requires manualChunks as a FUNCTION.
function manualChunks(id: string): string | undefined {
    if (!id.includes("node_modules")) return undefined;
    if (/[\\/]node_modules[\\/]pdfjs-dist[\\/]/.test(id)) return "pdfjs";
    if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
    return undefined;
}

/**
 * pdf.js fetches CMaps (CJK text), the 14 standard fonts (PDFs that don't
 * embed them), wasm image decoders and ICC profiles at runtime. Serve them
 * from node_modules in dev and copy them to dist/pdfjs/ on build, so they
 * always match the installed pdfjs-dist version.
 */
function pdfjsAssets(): Plugin {
    const src = resolve(import.meta.dirname, "node_modules/pdfjs-dist");
    const dirs = ["cmaps", "standard_fonts", "wasm", "iccs"];
    const types: Record<string, string> = { ".wasm": "application/wasm", ".js": "text/javascript" };
    let outDir = "";
    let isBuild = false;
    return {
        name: "pdfjs-assets",
        configResolved(config) {
            outDir = resolve(config.root, config.build.outDir);
            isBuild = config.command === "build";
        },
        configureServer(server) {
            server.middlewares.use(`${server.config.base}pdfjs`, (req, res, next) => {
                const path = decodeURIComponent((req.url ?? "").split("?")[0]);
                const file = resolve(src, `.${path}`);
                if (!dirs.some((dir) => file.startsWith(resolve(src, dir) + sep))) return next();
                try {
                    if (!statSync(file).isFile()) return next();
                } catch {
                    return next();
                }
                res.setHeader("Content-Type", types[extname(file)] ?? "application/octet-stream");
                createReadStream(file).pipe(res);
            });
        },
        closeBundle() {
            if (!isBuild) return;
            for (const dir of dirs) cpSync(resolve(src, dir), resolve(outDir, "pdfjs", dir), { recursive: true });
        },
    };
}

// https://vite.dev/config/
export default defineConfig({
    base: process.env.BASE_PATH ?? "/",
    plugins: [react(), tailwindcss(), pdfjsAssets()],
    resolve: {
        alias: {
            "@": resolve(import.meta.dirname, "src"),
        },
    },
    build: {
        rolldownOptions: {
            output: { manualChunks },
        },
    },
});

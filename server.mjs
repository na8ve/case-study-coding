import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./src/app.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));

const PAGES = {
	"/": ["index.html", "text/html; charset=utf-8"],
	"/admin": ["admin.html", "text/html; charset=utf-8"],
	"/app.js": ["app.js", "text/javascript; charset=utf-8"],
	"/admin.js": ["admin.js", "text/javascript; charset=utf-8"],
	"/styles.css": ["styles.css", "text/css; charset=utf-8"],
};

const MAX_BODY = 64 * 1024;

async function readBody(req) {
	let size = 0;
	const chunks = [];
	for await (const chunk of req) {
		size += chunk.length;
		if (size > MAX_BODY) throw new Error("body too large");
		chunks.push(chunk);
	}
	const text = Buffer.concat(chunks).toString("utf8");
	return text ? JSON.parse(text) : undefined;
}

export function startServer({ port = Number(process.env.PORT) || 8080, host = "127.0.0.1", app = createApp() } = {}) {
	const server = createServer(async (req, res) => {
		const send = (status, type, payload) => res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" }).end(payload);
		try {
			const pathname = new URL(req.url ?? "/", "http://shop.local").pathname;
			if (pathname.startsWith("/api/")) {
				const body = req.method === "POST" ? await readBody(req) : undefined;
				const out = await app.call(req.method, req.url, body);
				return send(out.status, "application/json", JSON.stringify(out.body));
			}
			const page = req.method === "GET" ? PAGES[pathname] : undefined;
			if (!page) return send(404, "text/plain", "not found");
			return send(200, page[1], await readFile(join(ROOT, "web", page[0])));
		} catch {
			return send(400, "application/json", JSON.stringify({ error: "bad request" }));
		}
	});
	return new Promise((resolve) => server.listen(port, host, () => resolve({ server, app, url: `http://${host}:${server.address().port}` })));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const { url } = await startServer();
	console.log(`Tidewell Goods (synthetic) on ${url}  ·  dashboards at ${url}/admin`);
}

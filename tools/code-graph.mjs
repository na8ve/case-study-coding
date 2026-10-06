#!/usr/bin/env node
// Turns this repository's source into typed facts for the agent's memory.
//
//   node tools/code-graph.mjs                  write memory/code/*.facts (one file per source file)
//   node tools/code-graph.mjs --check          exit 1 if memory/code is out of date with the source
//   node tools/code-graph.mjs --impact <name>  what depends on a function, constant, route or module
//   node tools/code-graph.mjs --impact <name> [--hops N] [--json]
//
// It reads .mjs .js .cjs and .ts files, skips node_modules, data, memory and tools,
// and sends nothing anywhere. A fact is `from | relation | to | sentence`; the
// sentence names the file and the line range, so a reader can open exactly
// those lines. Relations: defines, imports, calls, reads, handled_by,
// calls_api, emits_event, reads_event, covers, produced_by.
//
// It is a reader of source text, not a compiler: it finds top-level functions,
// classes and constants, the calls and reads between them, and the routes,
// requests, events and tests around them. A call it cannot resolve to a name
// defined in this repository is left out rather than guessed.
//
// A constant whose value is a plain number, string or boolean carries it
// (`constant FREE_SHIPPING_THRESHOLD_CENTS = 7500`), so changing the value
// changes that one fact, and a sync retires the old value.
//
// Money and rate fields (names ending in Cents or Rate) are followed from the
// function that builds them to every function that reads them, because a call
// graph alone cannot see that a dashboard depends on what pricing computes.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = "memory/code";
const SOURCE = new Set([".mjs", ".js", ".cjs", ".ts"]);
const SKIP = new Set(["node_modules", "data", "memory", "dist", "build", "tools"]);
const KEYWORDS = new Set(["if", "for", "while", "switch", "catch", "return", "typeof", "function", "await", "async", "new", "void", "delete", "throw", "else", "do", "in", "of", "import", "super", "yield"]);
const VERBS = "GET|POST|PUT|PATCH|DELETE";
const ID = "[A-Za-z_$][\\w$]*";
const FIELD = /^[a-z][A-Za-z0-9]*(Cents|Rate)$/;
const isTestPath = (p) => /(^|\/)(test|tests|spec)\//.test(p) || /\.(test|spec)\.[mc]?[jt]s$/.test(p);

const camel = (s) => s.replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function listSources(root = ROOT) {
	const out = [];
	const walk = (dir) => {
		for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
			if (e.name.startsWith(".")) continue;
			const p = join(dir, e.name);
			if (e.isDirectory()) {
				if (!SKIP.has(e.name)) walk(p);
			} else if (e.isFile() && SOURCE.has(extname(e.name)) && statSync(p).size <= 400_000) {
				out.push(relative(root, p).split(sep).join("/"));
			}
		}
	};
	walk(root);
	return out;
}

// `code` keeps strings and drops comments; `masked` also blanks the inside of
// strings and regular expressions. Both keep every newline and offset, so a
// position in one is a position in the other and in the source.
export function strip(src) {
	const n = src.length;
	const code = src.split("");
	const masked = src.split("");
	const blank = (arr, i) => {
		if (arr[i] !== "\n") arr[i] = " ";
	};
	let i = 0;
	let last = "";
	let lastWord = "";
	let word = "";
	const regexAllowed = () => last === "" || "(,=:[!&|?{};+-*%<>~^".includes(last) || lastWord === "return" || lastWord === "typeof";
	while (i < n) {
		const c = src[i];
		const d = src[i + 1];
		if (c === "/" && d === "/") {
			while (i < n && src[i] !== "\n") {
				blank(code, i);
				blank(masked, i);
				i++;
			}
			continue;
		}
		if (c === "/" && d === "*") {
			const end = src.indexOf("*/", i + 2);
			const stop = end < 0 ? n : end + 2;
			for (; i < stop; i++) {
				blank(code, i);
				blank(masked, i);
			}
			continue;
		}
		if (c === '"' || c === "'") {
			i++;
			while (i < n && src[i] !== c && src[i] !== "\n") {
				if (src[i] === "\\") blank(masked, i++);
				blank(masked, i++);
			}
			i++;
			last = "a";
			lastWord = word = "";
			continue;
		}
		if (c === "`") {
			i++;
			while (i < n && src[i] !== "`") {
				if (src[i] === "\\") {
					blank(masked, i++);
					blank(masked, i++);
				} else if (src[i] === "$" && src[i + 1] === "{") {
					i += 2;
					let depth = 1;
					while (i < n && depth) {
						if (src[i] === "{") depth++;
						else if (src[i] === "}") depth--;
						if (depth) i++;
					}
					i++;
				} else blank(masked, i++);
			}
			i++;
			last = "a";
			lastWord = word = "";
			continue;
		}
		if (c === "/" && regexAllowed()) {
			let j = i + 1;
			let cls = false;
			while (j < n && src[j] !== "\n" && (src[j] !== "/" || cls)) {
				if (src[j] === "\\") j++;
				else if (src[j] === "[") cls = true;
				else if (src[j] === "]") cls = false;
				j++;
			}
			if (src[j] === "/") {
				for (let k = i + 1; k < j; k++) blank(masked, k);
				i = j + 1;
				while (/[a-z]/.test(src[i] ?? "")) i++;
				last = "a";
				lastWord = word = "";
				continue;
			}
		}
		if (/[\w$]/.test(c)) word += c;
		else if (!/\s/.test(c)) {
			lastWord = word;
			word = "";
		} else if (word) {
			lastWord = word;
			word = "";
		}
		if (!/\s/.test(c)) last = c;
		i++;
	}
	return { code: code.join(""), masked: masked.join("") };
}

function depthMap(masked) {
	const depth = new Int32Array(masked.length + 1);
	let d = 0;
	for (let i = 0; i < masked.length; i++) {
		depth[i] = d;
		if (masked[i] === "{") d++;
		else if (masked[i] === "}") d = Math.max(0, d - 1);
	}
	return depth;
}

function matchBrace(masked, open) {
	let d = 0;
	for (let i = open; i < masked.length; i++) {
		if (masked[i] === "{") d++;
		else if (masked[i] === "}" && --d === 0) return i;
	}
	return masked.length - 1;
}

function endOfStatement(masked, from) {
	let nest = 0;
	for (let i = from; i < masked.length; i++) {
		const c = masked[i];
		if ("([{".includes(c)) nest++;
		else if (")]}".includes(c)) nest--;
		else if (nest <= 0 && c === ";") return i;
		else if (nest <= 0 && c === "\n") {
			const before = masked.slice(from, i).trimEnd().slice(-1);
			const after = masked.slice(i + 1).trimStart()[0] ?? "";
			if (!",+-*/&|?:=(.>".includes(before) && !".?:+-*/&|,".includes(after)) return i;
		}
	}
	return masked.length - 1;
}

const squash = (s) => s.replace(/\s+/g, " ").trim();

export function parseFile(path, src) {
	const { code, masked } = strip(src);
	const starts = [0];
	for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
	const lineOf = (index) => {
		let lo = 0;
		let hi = starts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (starts[mid] <= index) lo = mid;
			else hi = mid - 1;
		}
		return lo + 1;
	};
	const depth = depthMap(masked);
	const symbols = [];
	const lineStart = (m) => m.index + (m[0].startsWith("\n") ? 1 : 0);
	const add = (s) => symbols.push({ ...s, startLine: lineOf(s.start), endLine: lineOf(s.end) });

	for (const m of masked.matchAll(new RegExp(`(?:^|\\n)[ \\t]*(export\\s+)?(default\\s+)?(async\\s+)?function\\s*\\*?\\s*(${ID})\\s*\\(([^)]*)\\)\\s*\\{`, "g"))) {
		const start = lineStart(m);
		if (depth[start] !== 0) continue;
		add({ name: m[4], kind: "function", exported: Boolean(m[1]), params: squash(m[5]), start, end: matchBrace(masked, m.index + m[0].length - 1) });
	}
	for (const m of masked.matchAll(new RegExp(`(?:^|\\n)[ \\t]*(export\\s+)?class\\s+(${ID})[^{]*\\{`, "g"))) {
		const start = lineStart(m);
		if (depth[start] !== 0) continue;
		add({ name: m[2], kind: "class", exported: Boolean(m[1]), params: "", start, end: matchBrace(masked, m.index + m[0].length - 1) });
	}
	for (const m of masked.matchAll(new RegExp(`(?:^|\\n)[ \\t]*(export\\s+)?(?:const|let|var)\\s+(${ID})\\s*=\\s*`, "g"))) {
		const start = lineStart(m);
		if (depth[start] !== 0) continue;
		const after = m.index + m[0].length;
		const rest = masked.slice(after, after + 400);
		const arrow = rest.match(new RegExp(`^(async\\s+)?(?:\\(([^)]*)\\)|(${ID}))\\s*=>\\s*`));
		const fnExpr = rest.match(/^(async\s+)?function\b[^(]*\(([^)]*)\)\s*\{/);
		let kind = "constant";
		let params = "";
		let end;
		if (arrow) {
			kind = "function";
			params = squash(arrow[2] ?? arrow[3] ?? "");
			const at = after + arrow[0].length;
			end = masked[at] === "{" ? matchBrace(masked, at) : endOfStatement(masked, at);
		} else if (fnExpr) {
			kind = "function";
			params = squash(fnExpr[2]);
			end = matchBrace(masked, after + fnExpr[0].length - 1);
		} else end = endOfStatement(masked, after);
		if (kind === "constant" && !m[1] && !/^[A-Z][A-Z0-9_]+$/.test(m[2])) continue;
		let value;
		if (kind === "constant") {
			const literal = code.slice(after, end + 1).trim().replace(/;$/, "").trim();
			if (/^-?\d[\d_]*(\.\d+)?$|^(true|false|null)$/.test(literal) || /^(["'])[^"'\n]{0,60}\1$/.test(literal)) value = literal;
		}
		add({ name: m[2], kind, exported: Boolean(m[1]), params, start, end, value });
	}
	const later = new Set();
	for (const m of masked.matchAll(/(?:^|\n)\s*export\s*\{([^}]*)\}/g)) for (const part of m[1].split(",")) later.add(part.trim().split(/\s+as\s+/)[0]);
	for (const s of symbols) if (later.has(s.name)) s.exported = true;
	symbols.sort((a, b) => a.start - b.start);

	const imports = [];
	for (const m of code.matchAll(/(?:^|\n)[ \t]*import\s+(?:([\w$]+)\s*,?\s*)?(?:\*\s+as\s+([\w$]+)|\{([^}]*)\})?\s*(?:from\s*)?(["'])([^"']+)\4/g)) {
		const names = [];
		if (m[1]) names.push({ local: m[1], imported: "default" });
		for (const part of (m[3] ?? "").split(",")) {
			const [a, b] = part.trim().split(/\s+as\s+/);
			if (a) names.push({ local: b ?? a, imported: a });
		}
		imports.push({ spec: m[5], names, namespace: m[2] ?? null, line: lineOf(lineStart(m)) });
	}
	for (const m of code.matchAll(/(?:^|\n)[ \t]*export\s+(?:\*|\{[^}]*\})\s*from\s*(["'])([^"']+)\1/g)) imports.push({ spec: m[2], names: [], namespace: null, line: lineOf(lineStart(m)) });
	for (const m of code.matchAll(/\bimport\(\s*(["'])([^"']+)\1\s*\)/g)) imports.push({ spec: m[2], names: [], namespace: null, line: lineOf(m.index) });

	const routes = [];
	for (const m of code.matchAll(new RegExp(`(["'])((?:${VERBS}) /[^"'\\s]*)\\1\\s*:\\s*(${ID})?`, "g"))) {
		let handler = m[3] && !KEYWORDS.has(m[3]) ? m[3] : null;
		let body = null;
		if (!handler) {
			const from = m.index + m[0].length;
			const arrow = masked.slice(from, from + 300).match(/^\s*(async\s+)?(?:\([^)]*\)|[\w$]+)\s*=>\s*/);
			if (arrow) {
				const at = from + arrow[0].length;
				body = [at, masked[at] === "{" ? matchBrace(masked, at) : endOfStatement(masked, at)];
			}
		}
		if (handler && masked.slice(m.index + m[0].length).trimStart().startsWith("(")) handler = null;
		routes.push({ route: m[2], handler, line: lineOf(m.index), body });
	}
	for (const m of code.matchAll(new RegExp(`\\b(?:app|router|server)\\.(get|post|put|patch|delete)\\(\\s*(["'])(/[^"']*)\\2\\s*,\\s*(${ID})?`, "g"))) {
		routes.push({ route: `${m[1].toUpperCase()} ${m[3]}`, handler: m[4] && !KEYWORDS.has(m[4]) ? m[4] : null, line: lineOf(m.index), body: null });
	}

	const apiCalls = [];
	for (const m of code.matchAll(/(["'`])(\/api\/[A-Za-z0-9_\-/]*)(?=[?"'`$])/g)) {
		if (m[2].endsWith("/")) continue;
		const path = m[2];
		const back = code.slice(Math.max(0, m.index - 24), m.index);
		const after = m.index + m[0].length;
		let nest = 0;
		let stop = after;
		while (stop < code.length && stop < after + 400) {
			const ch = code[stop];
			if ("([{".includes(ch)) nest++;
			else if (")]}".includes(ch) && --nest < 0) break;
			stop++;
		}
		const fore = code.slice(m.index, stop);
		const verb = new RegExp(`(${VERBS})["']\\s*,\\s*$`).exec(back)?.[1] ?? new RegExp(`\\bmethod\\s*:\\s*["'](${VERBS})["']`).exec(fore)?.[1] ?? "GET";
		apiCalls.push({ route: `${verb} ${path}`, index: m.index });
	}

	const events = [];
	for (const m of code.matchAll(/\b(?:track|sendEvent|event)\(\s*(?:[\w$.]+\s*,\s*){0,2}(["'])([a-z][a-z0-9_]*)\1/g)) events.push({ name: m[2], index: m.index, kind: "emits_event" });
	for (const m of code.matchAll(/\bname\s*===?\s*(["'])([a-z][a-z0-9_]*)\1/g)) events.push({ name: m[2], index: m.index, kind: "reads_event" });
	for (const m of code.matchAll(/\b(?:eventsNamed|uniqueVisitors)\(\s*[\w$.]+\s*,\s*(["'])([a-z][a-z0-9_]*)\1/g)) events.push({ name: m[2], index: m.index, kind: "reads_event" });

	const cases = [];
	for (const m of code.matchAll(/(?:^|\n)[ \t]*(?:test|it|describe)\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g)) cases.push({ title: m[2].replace(/\\(.)/g, "$1"), index: lineStart(m) });

	const produced = [];
	for (const m of masked.matchAll(/(?:\breturn\s*|=>\s*\(?\s*|[^=!<>]=\s*)\{/g)) {
		const open = m.index + m[0].length - 1;
		const body = masked.slice(open + 1, matchBrace(masked, open));
		let level = 0;
		let entry = "";
		let at = open + 1;
		const flush = () => {
			const name = /^\s*([A-Za-z_$][\w$]*)\s*(?::|$)/.exec(entry)?.[1];
			if (name && FIELD.test(name)) produced.push({ name, index: at + entry.indexOf(name) });
		};
		for (let i = 0; i <= body.length; i++) {
			const c = body[i];
			if (i === body.length || (c === "," && level === 0)) {
				flush();
				entry = "";
				at = open + 1 + i + 1;
			} else {
				if ("([{".includes(c)) level++;
				else if (")]}".includes(c)) level--;
				entry += c;
			}
		}
	}
	for (const m of masked.matchAll(new RegExp(`(?<![\\w$])${ID}\\.([a-z][A-Za-z0-9]*(?:Cents|Rate))\\s*=(?!=)`, "g"))) produced.push({ name: m[1], index: m.index });
	const fieldReads = [];
	for (const m of masked.matchAll(/\.([a-z][A-Za-z0-9]*(?:Cents|Rate))\b(?!\s*=(?!=))/g)) fieldReads.push({ name: m[1], index: m.index });

	return { path, src, masked, symbols, imports, routes, apiCalls, events, cases, produced, fieldReads, lineOf };
}

function resolveSpec(fromPath, spec, known) {
	if (!spec.startsWith(".")) return null;
	const base = posix.normalize(posix.join(posix.dirname(fromPath), spec));
	return [base, `${base}.mjs`, `${base}.js`, `${base}.ts`, `${base}/index.mjs`, `${base}/index.js`].find((c) => known.has(c)) ?? null;
}

export function moduleNames(paths) {
	const stem = (p) => camel(basename(p).replace(/\.[^.]+$/, ""));
	const count = new Map();
	for (const p of paths) count.set(stem(p), (count.get(stem(p)) ?? 0) + 1);
	const names = new Map();
	const taken = new Set();
	for (const p of paths) {
		const parts = p.split("/");
		let name = stem(p);
		if (count.get(name) > 1) {
			for (let k = 2; k <= parts.length; k++) {
				name = camel(parts.slice(-k, -1).join("-")) + cap(stem(p));
				if (!taken.has(name)) break;
			}
		}
		taken.add(name);
		names.set(p, name);
	}
	return names;
}

export function buildIndex(root = ROOT) {
	const paths = listSources(root);
	const files = new Map(paths.map((p) => [p, parseFile(p, readFileSync(join(root, p), "utf8"))]));
	const known = new Set(paths);
	const mod = moduleNames(paths);
	const symbolNames = new Set();
	for (const f of files.values()) for (const s of f.symbols) symbolNames.add(s.name.toLowerCase());
	for (const [p, name] of mod) if (symbolNames.has(name.toLowerCase())) mod.set(p, `${name}Module`);
	const taken = new Set(mod.values());
	const count = new Map();
	for (const f of files.values()) for (const s of f.symbols) count.set(s.name, (count.get(s.name) ?? 0) + 1);
	const conceptOf = (path, s) => (count.get(s.name) > 1 || taken.has(s.name) ? `${mod.get(path)}.${s.name}` : s.name);
	const moduleConcept = (path) => mod.get(path);

	const defs = new Map();
	for (const f of files.values()) for (const s of f.symbols) defs.set(`${f.path}#${s.name}`, { path: f.path, symbol: s, concept: conceptOf(f.path, s) });

	const facts = new Map();
	const edges = [];
	const put = (path, from, rel, to, text) => {
		if (!from || !to || from.toLowerCase() === to.toLowerCase()) return;
		if (!facts.has(path)) facts.set(path, new Map());
		const key = `${from}\u0000${rel}\u0000${to}`;
		if (!facts.get(path).has(key)) facts.get(path).set(key, [from, rel, to, squash(text.replace(/\|/g, "/"))]);
		edges.push({ kind: rel, from, to });
	};

	for (const f of files.values()) {
		const me = moduleConcept(f.path);
		const bindings = new Map();
		const namespaces = new Map();
		for (const s of f.symbols) bindings.set(s.name, `${f.path}#${s.name}`);
		for (const imp of f.imports) {
			const target = resolveSpec(f.path, imp.spec, known);
			if (target) {
				const names = [...imp.names.map((n) => n.imported), ...(imp.namespace ? ["*"] : [])];
				put(f.path, me, "imports", moduleConcept(target), `${f.path} line ${imp.line} imports ${target}${names.length ? ` (${names.join(", ")})` : ""}.`);
				for (const n of imp.names) bindings.set(n.local, `${target}#${n.imported}`);
				if (imp.namespace) namespaces.set(imp.namespace, target);
			}
		}
		const lookup = (name) => defs.get(bindings.get(name) ?? "") ?? null;
		const holderAt = (index) => f.symbols.find((s) => s.kind !== "constant" && index >= s.start && index <= s.end) ?? null;
		const nameOf = (s) => conceptOf(f.path, s);

		for (const s of f.symbols) {
			put(f.path, me, "defines", nameOf(s), `${f.path} lines ${s.startLine}-${s.endLine}: ${s.kind} ${s.name}${s.kind === "function" ? `(${s.params})` : ""}${s.value !== undefined ? ` = ${s.value}` : ""}${s.exported ? ", exported" : ""}.`);
		}

		const scan = (owner, from, start, end, label, skip = []) => {
			let text = f.masked.slice(start, end + 1).replaceAll("...", "   ");
			text = text.replace(/\bimport\b[^;]*?\bfrom\s*(["'])\s*\1|\bexport\s*\{[^}]*\}(?:\s*from\s*(["'])\s*\2)?/g, (x) => " ".repeat(x.length));
			for (const [a, b] of skip) if (b >= start && a <= end) text = text.slice(0, Math.max(0, a - start)) + " ".repeat(Math.max(0, Math.min(b, end) - Math.max(a, start) + 1)) + text.slice(Math.min(b, end) - start + 1);
			const seen = new Set();
			for (const m of text.matchAll(new RegExp(`(?<![\\w$.])(?:new\\s+)?(${ID})(\\s*\\()?`, "g"))) {
				const name = m[1];
				if (KEYWORDS.has(name)) continue;
				const before = text.slice(Math.max(0, m.index - 12), m.index);
				if (/(?:function\s*\*?|const|let|var|class)\s+$/.test(before)) continue;
				const target = lookup(name);
				if (!target || target.symbol === owner) continue;
				const call = Boolean(m[2]);
				if (call === (target.symbol.kind === "constant")) continue;
				const rel = call ? "calls" : "reads";
				if (seen.has(`${rel}|${target.concept}`)) continue;
				seen.add(`${rel}|${target.concept}`);
				put(f.path, from, rel, target.concept, `${label} (${f.path} line ${f.lineOf(start + m.index)}) ${rel} ${target.concept}.`);
			}
			for (const m of text.matchAll(new RegExp(`(?<![\\w$.])(${ID})\\.(${ID})\\s*\\(`, "g"))) {
				const file = namespaces.get(m[1]);
				const target = file && defs.get(`${file}#${m[2]}`);
				if (target && target.symbol !== owner) put(f.path, from, "calls", target.concept, `${label} (${f.path} line ${f.lineOf(start + m.index)}) calls ${target.concept}.`);
			}
		};
		const routeBodies = f.routes.filter((r) => r.body).map((r) => r.body);
		for (const s of f.symbols) scan(s, nameOf(s), s.start, s.end, s.name, s.kind === "constant" ? routeBodies : []);

		const owned = f.symbols.map((s) => [s.start, s.end]).sort((a, b) => a[0] - b[0]);
		const free = [];
		let at = 0;
		for (const [a, b] of owned) {
			if (a > at) free.push([at, a - 1]);
			at = Math.max(at, b + 1);
		}
		if (at < f.masked.length) free.push([at, f.masked.length - 1]);
		const isTest = isTestPath(f.path);
		for (const [a, b] of free) {
			if (!f.masked.slice(a, b + 1).trim()) continue;
			if (!isTest) {
				scan(null, me, a, b, `module ${me}`);
				continue;
			}
			const called = (from, to) => [...new Set([...f.masked.slice(from, to + 1).replaceAll("...", "   ").matchAll(new RegExp(`(?<![\\w$.])(${ID})\\s*\\(`, "g"))].map((m) => m[1]))];
			const titles = new Map();
			f.cases.forEach((c, i) => {
				if (c.index < a || c.index > b) return;
				const end = Math.min(b, (f.cases[i + 1]?.index ?? b + 1) - 1);
				for (const name of called(c.index, end)) titles.set(name, [...(titles.get(name) ?? []), c.title]);
			});
			for (const name of called(a, b)) {
				const target = lookup(name);
				if (!target || target.symbol.kind === "constant" || isTestPath(target.path)) continue;
				const said = (titles.get(name) ?? []).slice(0, 3).map((t) => `"${t.length > 80 ? `${t.slice(0, 77)}...` : t}"`);
				put(f.path, me, "covers", target.concept, `${f.path} exercises ${target.concept}${said.length ? ` in: ${said.join("; ")}` : ""}.`);
			}
		}

		for (const r of f.routes) {
			put(f.path, me, "defines", r.route, `${f.path} line ${r.line}: route ${r.route}.`);
			if (r.handler) {
				const target = lookup(r.handler);
				const name = target ? target.concept : r.handler;
				put(f.path, r.route, "handled_by", name, `${r.route} is handled by ${name}.`);
			}
			if (r.body) scan(null, r.route, r.body[0], r.body[1], r.route);
		}
		for (const a of f.apiCalls) {
			const holder = holderAt(a.index) ?? f.symbols.find((s) => a.index >= s.start && a.index <= s.end);
			const from = holder ? nameOf(holder) : me;
			put(f.path, from, "calls_api", a.route, `${holder ? holder.name : `module ${me}`} (${f.path} line ${f.lineOf(a.index)}) requests ${a.route}.`);
		}
		for (const p of f.produced) {
			const holder = holderAt(p.index);
			if (holder) put(f.path, p.name, "produced_by", nameOf(holder), `${holder.name} (${f.path} line ${f.lineOf(p.index)}) builds ${p.name}.`);
		}
		for (const r of f.fieldReads) {
			const holder = holderAt(r.index);
			if (holder) put(f.path, nameOf(holder), "reads", r.name, `${holder.name} (${f.path} line ${f.lineOf(r.index)}) reads the ${r.name} field.`);
		}
		for (const e of f.events) {
			const holder = holderAt(e.index);
			const from = holder ? nameOf(holder) : me;
			put(f.path, from, e.kind, e.name, `${holder ? holder.name : `module ${me}`} (${f.path} line ${f.lineOf(e.index)}) ${e.kind === "emits_event" ? "records" : "reads"} the ${e.name} event.`);
		}
	}
	return { files, mod, defs, facts, edges, moduleConcept };
}

export function render(graph) {
	const out = new Map();
	for (const [path, map] of graph.facts) {
		const rows = [...map.values()].sort((a, b) => (a.join("\u0000") < b.join("\u0000") ? -1 : 1));
		const text = [`# Code graph for ${path}. Generated by tools/code-graph.mjs; do not edit.`, ...rows.map(([a, r, b, s]) => `${a} | ${r} | ${b} | ${s}`)].join("\n") + "\n";
		out.set(`${OUT}/${path.replace(/\//g, "__")}.facts`, text);
	}
	return out;
}

export function reverse(graph, name, kinds = ["calls", "reads", "handled_by", "calls_api", "produced_by"]) {
	const into = new Map();
	for (const e of graph.edges) if (kinds.includes(e.kind)) into.set(e.to, [...(into.get(e.to) ?? []), e.from]);
	const hops = new Map();
	let frontier = [name];
	for (let h = 1; frontier.length; h++) {
		const next = [];
		for (const at of frontier) {
			for (const from of into.get(at) ?? []) {
				if (from !== name && !hops.has(from)) {
					hops.set(from, h);
					next.push(from);
				}
			}
		}
		frontier = next;
	}
	return hops;
}

export function impact(graph, name, { hops = 6 } = {}) {
	const places = new Map();
	for (const d of graph.defs.values()) places.set(d.concept, { path: d.path, from: d.symbol.startLine, to: d.symbol.endLine });
	for (const f of graph.files.values()) for (const r of f.routes) places.set(r.route, { path: f.path, from: r.line, to: r.line });
	const modules = new Map([...graph.mod.keys()].map((path) => [graph.moduleConcept(path), { path, from: 1, to: graph.files.get(path).src.split("\n").length }]));
	const all = new Map([...places, ...modules]);
	const target = all.has(name) ? name : [...all.keys()].find((k) => k.toLowerCase() === name.toLowerCase());
	if (!target) return { found: false, name };

	const testModules = new Set([...graph.files.values()].filter((f) => isTestPath(f.path)).map((f) => graph.moduleConcept(f.path)));
	const reach = reverse(graph, target);
	const near = new Map([...reach].filter(([c, h]) => h <= hops && !testModules.has(c) && all.has(c)));
	const importers = reverse(graph, target, ["imports"]);
	const touched = new Set([target, ...near.keys()]);
	const tests = new Set([...graph.edges.filter((e) => e.kind === "covers" && touched.has(e.to)).map((e) => e.from), ...[...reach.keys()].filter((c) => testModules.has(c))]);
	const rows = (names) => [...names].filter((c) => all.has(c)).map((concept) => ({ concept, ...all.get(concept) }));
	const ordered = [...near].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1));
	const cited = new Map();
	for (const c of [target, ...near.keys(), ...tests]) {
		const at = places.get(c);
		if (at) cited.set(at.path, [...(cited.get(at.path) ?? []), [at.from, at.to]]);
	}
	const files = new Set([...cited.keys(), ...[...modules.entries()].filter(([c]) => touched.has(c) || tests.has(c)).map(([, v]) => v.path)]);
	let whole = 0;
	for (const p of files) whole += graph.files.get(p).src.length;
	let chars = 0;
	for (const [path, spans] of cited) {
		const lines = graph.files.get(path).src.split("\n");
		const seen = new Set();
		for (const [a, b] of spans) for (let l = a; l <= b; l++) seen.add(l);
		for (const l of seen) chars += (lines[l - 1] ?? "").length + 1;
	}
	return {
		found: true,
		name: target,
		definedAt: all.get(target),
		hops,
		dependents: ordered.map(([concept, h]) => ({ concept, hops: h, ...all.get(concept) })),
		importedBy: rows(importers.keys()),
		routes: ordered.map(([c]) => c).filter((c) => new RegExp(`^(${VERBS}) /`).test(c)),
		tests: rows(tests),
		readCost: { filesToOpen: files.size, wholeFileTokens: Math.ceil(whole / 4), citedRangeTokens: Math.ceil(chars / 4) },
	};
}

function writeAll(root, rendered) {
	mkdirSync(join(root, OUT), { recursive: true });
	const changed = [];
	for (const [rel, text] of rendered) {
		const file = join(root, rel);
		if (!existsSync(file) || readFileSync(file, "utf8") !== text) {
			writeFileSync(file, text);
			changed.push(basename(rel).replace(/\.facts$/, "").replace(/__/g, "/"));
		}
	}
	const keep = new Set([...rendered.keys()].map((r) => basename(r)));
	const removed = [];
	for (const f of readdirSync(join(root, OUT))) {
		if (f.endsWith(".facts") && !keep.has(f)) {
			rmSync(join(root, OUT, f));
			removed.push(f.replace(/\.facts$/, "").replace(/__/g, "/"));
		}
	}
	return { changed, removed };
}

function staleness(root, rendered) {
	const bad = [];
	for (const [rel, text] of rendered) if (!existsSync(join(root, rel)) || readFileSync(join(root, rel), "utf8") !== text) bad.push(`${basename(rel)} (out of date)`);
	if (existsSync(join(root, OUT))) {
		const keep = new Set([...rendered.keys()].map((r) => basename(r)));
		for (const f of readdirSync(join(root, OUT))) if (f.endsWith(".facts") && !keep.has(f)) bad.push(`${f} (its source is gone)`);
	}
	return bad;
}

function printImpact(r) {
	if (!r.found) return console.log(`No function, constant, route or module named "${r.name}".`);
	const at = (x) => (x.path ? `${x.path}:${x.from}-${x.to}` : "");
	console.log(`${r.name}  ${at(r.definedAt)}`);
	const section = (title, rows, line) => {
		if (rows.length) console.log(`\n${title}\n${rows.map((x) => `  ${line(x)}`).join("\n")}`);
	};
	section(`Depends on it (calls, reads or data, nearest first, up to ${r.hops} hops)`, r.dependents, (d) => `${d.concept.padEnd(28)} ${at(d)}  hop ${d.hops}`);
	section("Modules that import its module", r.importedBy, (d) => `${d.concept.padEnd(28)} ${at(d)}`);
	section("Routes that reach it", r.routes, (x) => x);
	section("Tests that exercise it or what depends on it", r.tests, (d) => `${d.concept.padEnd(28)} ${at(d)}`);
	const c = r.readCost;
	console.log(`\nTo see all of it: ${c.filesToOpen} files, about ${c.wholeFileTokens} tokens read whole, or about ${c.citedRangeTokens} tokens for just the lines above (4 characters a token).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	const args = process.argv.slice(2);
	const graph = buildIndex(ROOT);
	const rendered = render(graph);
	if (args.includes("--impact")) {
		const name = args[args.indexOf("--impact") + 1];
		if (!name || name.startsWith("--")) {
			console.error("usage: node tools/code-graph.mjs --impact <name> [--json]");
			process.exit(2);
		}
		const hopsArg = args.includes("--hops") ? Number(args[args.indexOf("--hops") + 1]) : 6;
		const r = impact(graph, name, { hops: Number.isFinite(hopsArg) && hopsArg > 0 ? hopsArg : 6 });
		if (args.includes("--json")) console.log(JSON.stringify(r));
		else printImpact(r);
		process.exit(r.found ? 0 : 1);
	}
	if (args.includes("--check")) {
		const bad = staleness(ROOT, rendered);
		if (bad.length) {
			console.error(`memory/code is out of date: ${bad.join(", ")}. Run: node tools/code-graph.mjs`);
			process.exit(1);
		}
		console.log("memory/code matches the source.");
	} else {
		const { changed, removed } = writeAll(ROOT, rendered);
		const total = [...graph.facts.values()].reduce((n, m) => n + m.size, 0);
		console.log(`${total} facts from ${graph.files.size} files. ${changed.length ? `Changed: ${changed.join(", ")}.` : "Nothing changed."}${removed.length ? ` Removed: ${removed.join(", ")}.` : ""}`);
	}
}

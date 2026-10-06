const DAY_MS = 24 * 60 * 60 * 1000;

export function dayKey(ts) {
	return new Date(ts).toISOString().slice(0, 10);
}

export function daysSpanned(events) {
	if (!events.length) return 1;
	let lo = Infinity;
	let hi = -Infinity;
	for (const e of events) {
		lo = Math.min(lo, e.ts);
		hi = Math.max(hi, e.ts);
	}
	return Math.max(1, Math.ceil((hi - lo) / DAY_MS) || 1);
}

export function uniqueVisitors(events, name) {
	return new Set(events.filter((e) => !name || e.name === name).map((e) => e.visitor));
}

export function ratio(a, b) {
	return b > 0 ? a / b : 0;
}

export function byDay(items, pick) {
	const out = new Map();
	for (const it of items) {
		const k = dayKey(it.ts);
		out.set(k, (out.get(k) ?? 0) + pick(it));
	}
	return [...out].sort(([a], [b]) => (a < b ? -1 : 1)).map(([day, value]) => ({ day, value }));
}

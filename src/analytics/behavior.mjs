import { byDay, ratio, uniqueVisitors } from "./util.mjs";

export const FUNNEL_STAGES = ["page_view", "product_view", "add_to_cart", "checkout_start", "purchase"];

export function funnel(events) {
	const stages = FUNNEL_STAGES.map((name) => ({ name, visitors: uniqueVisitors(events, name).size }));
	return stages.map((s, i) => ({
		...s,
		rateFromStart: ratio(s.visitors, stages[0].visitors),
		rateFromPrevious: i === 0 ? 1 : ratio(s.visitors, stages[i - 1].visitors),
	}));
}

export function byDevice(events) {
	const seen = uniqueVisitors(events, "page_view");
	const deviceOf = new Map();
	for (const e of events) if (e.props.device) deviceOf.set(e.visitor, e.props.device);
	const buyers = uniqueVisitors(events, "purchase");
	const rows = new Map();
	for (const v of seen) {
		const d = deviceOf.get(v) ?? "unknown";
		const r = rows.get(d) ?? { device: d, visitors: 0, purchasers: 0 };
		r.visitors++;
		if (buyers.has(v)) r.purchasers++;
		rows.set(d, r);
	}
	return [...rows.values()].map((r) => ({ ...r, conversionRate: ratio(r.purchasers, r.visitors) })).sort((a, b) => b.visitors - a.visitors);
}

export function topProducts(events, limit = 5) {
	const views = new Map();
	const adds = new Map();
	for (const e of events) {
		if (e.name === "product_view") views.set(e.props.sku, (views.get(e.props.sku) ?? 0) + 1);
		if (e.name === "add_to_cart") adds.set(e.props.sku, (adds.get(e.props.sku) ?? 0) + 1);
	}
	return [...views]
		.map(([sku, n]) => ({ sku, views: n, adds: adds.get(sku) ?? 0, addRate: ratio(adds.get(sku) ?? 0, n) }))
		.sort((a, b) => b.views - a.views)
		.slice(0, limit);
}

export function behaviorReport(store) {
	const visitors = uniqueVisitors(store.events, "page_view");
	return {
		visitors: visitors.size,
		funnel: funnel(store.events),
		byDevice: byDevice(store.events),
		topProducts: topProducts(store.events),
		dailyVisitors: byDay(
			store.events.filter((e) => e.name === "page_view"),
			() => 1,
		),
	};
}

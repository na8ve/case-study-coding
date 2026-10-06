import { CHANNELS, DAILY_SPEND_CENTS } from "../marketing.mjs";
import { daysSpanned, ratio, uniqueVisitors } from "./util.mjs";

export function marketingReport(store) {
	const days = daysSpanned(store.events);
	const arrivals = new Map();
	for (const e of store.events) if (e.name === "page_view") arrivals.set(e.visitor, e.props.channel ?? "organic");
	const live = store.orders.filter((o) => !o.refundedAt);
	const rows = CHANNELS.map((channel) => {
		const visitors = [...arrivals].filter(([, c]) => c === channel).length;
		const orders = live.filter((o) => o.channel === channel);
		const customers = new Set(orders.map((o) => o.visitor)).size;
		const revenueCents = orders.reduce((n, o) => n + o.subtotalCents - o.discountCents + o.shippingCents, 0);
		const spendCents = DAILY_SPEND_CENTS[channel] * days;
		return {
			channel,
			visitors,
			orders: orders.length,
			customers,
			conversionRate: ratio(orders.length, visitors),
			revenueCents,
			spendCents,
			cacCents: customers ? Math.round(spendCents / customers) : null,
			roas: spendCents ? revenueCents / spendCents : null,
		};
	});
	return { days, channels: rows, totalVisitors: uniqueVisitors(store.events, "page_view").size };
}

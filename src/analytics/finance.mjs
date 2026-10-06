import { byDay, ratio } from "./util.mjs";

const FEE_RATE = 0.029;
const FEE_FIXED_CENTS = 30;

export function orderEconomics(order) {
	const revenueCents = order.subtotalCents - order.discountCents + order.shippingCents;
	const cogsCents = order.items.reduce((n, it) => n + it.costCents * it.qty, 0);
	const feesCents = Math.round(order.totalCents * FEE_RATE) + FEE_FIXED_CENTS;
	const refunded = Boolean(order.refundedAt);
	const kept = refunded ? 0 : revenueCents;
	return {
		revenueCents: kept,
		cogsCents,
		shippingCostCents: order.carrierCostCents,
		feesCents,
		discountCents: order.discountCents,
		marginCents: kept - cogsCents - order.carrierCostCents - feesCents,
		refundedCents: refunded ? revenueCents : 0,
	};
}

export function financeReport(store) {
	const rows = store.orders.map((o) => ({ ts: o.ts, ...orderEconomics(o) }));
	const sum = (k) => rows.reduce((n, r) => n + r[k], 0);
	const revenueCents = sum("revenueCents");
	const marginCents = sum("marginCents");
	return {
		orders: store.orders.length,
		revenueCents,
		cogsCents: sum("cogsCents"),
		shippingCostCents: sum("shippingCostCents"),
		feesCents: sum("feesCents"),
		discountCents: sum("discountCents"),
		refundedCents: sum("refundedCents"),
		marginCents,
		marginRate: ratio(marginCents, revenueCents),
		averageOrderCents: store.orders.length ? Math.round(revenueCents / store.orders.length) : 0,
		dailyRevenue: byDay(rows, (r) => r.revenueCents),
		dailyMargin: byDay(rows, (r) => r.marginCents),
	};
}

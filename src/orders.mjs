import { CARRIER_COST_CENTS } from "./pricing.mjs";
import { track } from "./events.mjs";

export function isFirstOrder(store, visitor) {
	return !store.orders.some((o) => o.visitor === visitor);
}

export function createOrder(store, clock, { visitor, channel, device, priced }) {
	const id = `O-${String(store.nextOrderNumber++).padStart(5, "0")}`;
	const order = {
		id,
		visitor,
		ts: clock.now(),
		channel,
		device,
		items: priced.lines.map((l) => ({ sku: l.sku, qty: l.qty, unitCents: l.unitCents, costCents: l.costCents })),
		couponCode: priced.couponCode,
		...priced.totals,
		carrierCostCents: CARRIER_COST_CENTS,
		refundedAt: null,
	};
	store.orders.push(order);
	track(store, clock, "purchase", visitor, { orderId: id, channel, device, totalCents: order.totalCents });
	return order;
}

export function refundOrder(store, clock, orderId) {
	const order = store.orders.find((o) => o.id === orderId);
	if (!order) return null;
	if (order.refundedAt) return order;
	order.refundedAt = clock.now();
	track(store, clock, "refund", order.visitor, { orderId });
	return order;
}

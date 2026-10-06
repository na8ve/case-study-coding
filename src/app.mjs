import { behaviorReport } from "./analytics/behavior.mjs";
import { marketingReport } from "./analytics/acquisition.mjs";
import { financeReport } from "./analytics/finance.mjs";
import { listProducts } from "./catalog.mjs";
import { CartError, priceCart } from "./cart.mjs";
import { placeOrder } from "./checkout.mjs";
import { systemClock } from "./clock.mjs";
import { isEventName, track } from "./events.mjs";
import { storefrontConfig } from "./flags.mjs";
import { isFirstOrder, refundOrder } from "./orders.mjs";
import { createStore } from "./store.mjs";

export class HttpError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}

const need = (value, what) => {
	if (typeof value !== "string" || !value || value.length > 80) throw new HttpError(400, `${what} is required`);
	return value;
};

function getProducts(_ctx, { query }) {
	return { products: listProducts(query.category ?? null) };
}

function getStorefront(_ctx, { query }) {
	return storefrontConfig(need(query.visitor, "visitor"));
}

function postEvent(ctx, { body }) {
	if (!isEventName(body?.name)) throw new HttpError(400, "unknown event");
	track(ctx.store, ctx.clock, body.name, need(body.visitor, "visitor"), body.props ?? {});
	return { ok: true };
}

function postQuote(ctx, { body }) {
	const visitor = need(body?.visitor, "visitor");
	const config = storefrontConfig(visitor);
	const priced = priceCart(body.items, {
		couponCode: body.coupon ?? null,
		firstOrder: isFirstOrder(ctx.store, visitor),
		thresholdCents: config.freeShippingThresholdCents,
	});
	return { lines: priced.lines, coupon: priced.couponCode, totals: priced.totals };
}

function postCheckout(ctx, { body }) {
	const visitor = need(body?.visitor, "visitor");
	const config = storefrontConfig(visitor);
	const order = placeOrder(ctx.store, ctx.clock, {
		visitor,
		items: body.items,
		couponCode: body.coupon ?? null,
		channel: body.channel,
		device: body.device,
		thresholdCents: config.freeShippingThresholdCents,
	});
	return { orderId: order.id, totalCents: order.totalCents, shippingCents: order.shippingCents, discountCents: order.discountCents };
}

function postRefund(ctx, { body }) {
	const order = refundOrder(ctx.store, ctx.clock, need(body?.orderId, "orderId"));
	if (!order) throw new HttpError(404, "no such order");
	return { orderId: order.id, refundedAt: order.refundedAt };
}

function getBehavior(ctx) {
	return behaviorReport(ctx.store);
}

function getMarketing(ctx) {
	return marketingReport(ctx.store);
}

function getFinance(ctx) {
	return financeReport(ctx.store);
}

async function postSimulate(ctx, { body }) {
	const { runSimulation } = await import("../sim/run.mjs");
	const shoppers = Math.min(5000, Math.max(1, Number(body?.shoppers) || 500));
	return runSimulation({ ctx, call: (m, t, b) => handle(ctx, m, t, b) }, { shoppers, seed: Number(body?.seed) || 1 });
}

export const ROUTES = {
	"GET /api/products": getProducts,
	"GET /api/storefront": getStorefront,
	"POST /api/events": postEvent,
	"POST /api/quote": postQuote,
	"POST /api/checkout": postCheckout,
	"POST /api/orders/refund": postRefund,
	"GET /api/admin/behavior": getBehavior,
	"GET /api/admin/marketing": getMarketing,
	"GET /api/admin/finance": getFinance,
	"POST /api/dev/simulate": postSimulate,
};

async function handle(ctx, method, target, body) {
	const url = new URL(target, "http://shop.local");
	const route = ROUTES[`${method} ${url.pathname}`];
	if (!route) return { status: 404, body: { error: "not found" } };
	try {
		return { status: 200, body: await route(ctx, { query: Object.fromEntries(url.searchParams), body }) };
	} catch (e) {
		if (e instanceof HttpError) return { status: e.status, body: { error: e.message } };
		if (e instanceof CartError) return { status: 400, body: { error: e.message } };
		throw e;
	}
}

export function createApp({ clock = systemClock, store = createStore() } = {}) {
	const ctx = { clock, store };
	return { ctx, call: (method, target, body) => handle(ctx, method, target, body) };
}

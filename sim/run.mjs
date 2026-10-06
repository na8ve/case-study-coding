import { fileURLToPath } from "node:url";
import { PRODUCTS } from "../src/catalog.mjs";
import { createApp } from "../src/app.mjs";
import { createClock } from "../src/clock.mjs";
import { CHANNEL_MIX, DEVICE_MIX, pAddToCart, pBuy, pStartCheckout, pViewProduct, refundShare, returningShare, wantsTopUp } from "./behavior.mjs";
import { pickWeighted, rngFor } from "./rng.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;
const START_MS = Date.UTC(2026, 8, 1);

function viewsFor(rand, categoryLean) {
	const n = 1 + Math.floor(rand() * 4);
	const picks = [];
	for (let i = 0; i < n; i++) {
		const pool = rand() < 0.6 ? PRODUCTS.filter((p) => p.category === categoryLean) : PRODUCTS;
		picks.push(pool[Math.floor(rand() * pool.length)]);
	}
	return picks;
}

export async function runSimulation(app, { shoppers = 500, seed = 1, days = 14, startMs = START_MS } = {}) {
	const real = app.ctx.clock;
	const clock = createClock(startMs);
	app.ctx.clock = clock;
	const buyers = [];
	let orders = 0;
	let visitors = 0;
	try {
		for (let i = 0; i < shoppers; i++) {
			const rand = rngFor(seed, i);
			clock.set(startMs + Math.floor((i / shoppers) * days * DAY_MS));
			const returning = buyers.length > 0 && rand() < returningShare;
			const visitor = returning ? buyers[Math.floor(rand() * buyers.length)] : `v-${seed}-${i}`;
			const channel = pickWeighted(rand, CHANNEL_MIX);
			const device = pickWeighted(rand, DEVICE_MIX);
			const get = (path) => app.call("GET", path).then((r) => r.body);
			const post = (path, body) => app.call("POST", path, body).then((r) => r.body);
			const event = (name, props) => post("/api/events", { visitor, name, props });

			const config = await get(`/api/storefront?visitor=${visitor}`);
			await event("page_view", { channel, device });
			visitors++;
			if (rand() > pViewProduct()) continue;

			const lean = ["kitchen", "outdoor", "desk", "home"][Math.floor(rand() * 4)];
			const cart = new Map();
			for (const product of viewsFor(rand, lean)) {
				clock.set(clock.now() + 20_000);
				await event("product_view", { sku: product.sku });
				if (rand() < pAddToCart(channel, device)) {
					cart.set(product.sku, (cart.get(product.sku) ?? 0) + (rand() < 0.1 ? 2 : 1));
					await event("add_to_cart", { sku: product.sku });
				}
			}
			if (cart.size === 0) continue;
			const items = () => [...cart].map(([sku, qty]) => ({ sku, qty }));
			const list = () => items().reduce((n, it) => n + PRODUCTS.find((p) => p.sku === it.sku).priceCents * it.qty, 0);

			if (wantsTopUp(list(), config.freeShippingThresholdCents, config.banner, rand)) {
				const gap = config.freeShippingThresholdCents - list();
				const extra = [...PRODUCTS].filter((p) => p.priceCents >= gap).sort((a, b) => a.priceCents - b.priceCents)[0];
				if (extra) {
					cart.set(extra.sku, (cart.get(extra.sku) ?? 0) + 1);
					await event("add_to_cart", { sku: extra.sku });
				}
			}

			if (rand() > pStartCheckout()) continue;
			clock.set(clock.now() + 45_000);
			await event("checkout_start", {});
			const coupon = config.autoCoupon ?? null;
			const quote = await post("/api/quote", { visitor, items: items(), coupon });
			if (rand() > pBuy({ channel, quote, listSubtotalCents: list(), banner: config.banner })) continue;

			clock.set(clock.now() + 60_000);
			const order = await post("/api/checkout", { visitor, items: items(), coupon, channel, device });
			orders++;
			buyers.push(visitor);
			if (rand() < refundShare) {
				clock.set(clock.now() + 3 * DAY_MS);
				await post("/api/orders/refund", { orderId: order.orderId });
			}
		}
	} finally {
		app.ctx.clock = real;
	}
	return { shoppers, visitors, orders, seed };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const arg = (name, dflt) => {
		const i = process.argv.indexOf(`--${name}`);
		return i >= 0 ? Number(process.argv[i + 1]) : dflt;
	};
	const app = createApp();
	const out = await runSimulation(app, { shoppers: arg("shoppers", 2000), seed: arg("seed", 1) });
	const finance = (await app.call("GET", "/api/admin/finance")).body;
	console.log(`${out.shoppers} shoppers, ${out.orders} orders, revenue $${(finance.revenueCents / 100).toFixed(2)}, margin $${(finance.marginCents / 100).toFixed(2)}`);
}

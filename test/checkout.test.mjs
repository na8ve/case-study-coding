import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.mjs";
import { createClock } from "../src/clock.mjs";

const fresh = () => createApp({ clock: createClock(Date.UTC(2026, 8, 1)) });

test("an order records its totals, its cost to us, and a purchase event", async () => {
	const app = fresh();
	const out = await app.call("POST", "/api/checkout", { visitor: "v1", items: [{ sku: "OD-001", qty: 1 }], channel: "email", device: "mobile" });
	assert.equal(out.status, 200);
	const order = app.ctx.store.orders[0];
	assert.equal(order.channel, "email");
	assert.equal(order.carrierCostCents, 450);
	assert.equal(order.shippingCents, 0, "9,900 ships free");
	assert.deepEqual(app.ctx.store.events.map((e) => e.name), ["purchase"]);
});

test("the first order gets WELCOME15 and the second does not", async () => {
	const app = fresh();
	const buy = () => app.call("POST", "/api/checkout", { visitor: "v1", items: [{ sku: "KT-004", qty: 1 }], coupon: "WELCOME15" });
	assert.equal((await buy()).body.discountCents, 840);
	assert.equal((await buy()).body.discountCents, 0);
});

test("a bad cart is a 400, not a crash", async () => {
	const app = fresh();
	assert.equal((await app.call("POST", "/api/checkout", { visitor: "v1", items: [] })).status, 400);
	assert.equal((await app.call("POST", "/api/checkout", { items: [{ sku: "KT-001", qty: 1 }] })).status, 400);
});

test("a refund reverses the order once", async () => {
	const app = fresh();
	const { body } = await app.call("POST", "/api/checkout", { visitor: "v1", items: [{ sku: "KT-001", qty: 1 }] });
	assert.equal((await app.call("POST", "/api/orders/refund", { orderId: body.orderId })).status, 200);
	await app.call("POST", "/api/orders/refund", { orderId: body.orderId });
	assert.equal(app.ctx.store.events.filter((e) => e.name === "refund").length, 1);
	assert.equal((await app.call("POST", "/api/orders/refund", { orderId: "O-99999" })).status, 404);
});

test("an unknown event name is refused", async () => {
	const app = fresh();
	assert.equal((await app.call("POST", "/api/events", { visitor: "v1", name: "teleport" })).status, 400);
	assert.equal((await app.call("POST", "/api/events", { visitor: "v1", name: "page_view", props: {} })).status, 200);
});

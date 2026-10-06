import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.mjs";
import { createClock } from "../src/clock.mjs";
import { runSimulation } from "../sim/run.mjs";

const simulated = async (shoppers = 600, seed = 3) => {
	const app = createApp({ clock: createClock(Date.UTC(2026, 8, 1)) });
	await runSimulation(app, { shoppers, seed });
	return app;
};

test("the funnel only narrows", async () => {
	const app = await simulated();
	const { funnel } = (await app.call("GET", "/api/admin/behavior")).body;
	for (let i = 1; i < funnel.length; i++) assert.ok(funnel[i].visitors <= funnel[i - 1].visitors, `${funnel[i].name} <= ${funnel[i - 1].name}`);
	assert.ok(funnel.at(-1).visitors > 0, "control: somebody bought");
});

test("channel revenue adds up to the finance revenue before refunds", async () => {
	const app = await simulated();
	const m = (await app.call("GET", "/api/admin/marketing")).body;
	const f = (await app.call("GET", "/api/admin/finance")).body;
	const live = m.channels.reduce((n, c) => n + c.revenueCents, 0);
	assert.equal(live, f.revenueCents);
});

test("organic traffic has no spend and so no ROAS", async () => {
	const app = await simulated();
	const organic = (await app.call("GET", "/api/admin/marketing")).body.channels.find((c) => c.channel === "organic");
	assert.equal(organic.spendCents, 0);
	assert.equal(organic.roas, null);
});

test("margin is revenue less goods, carrier and fees, and a refund removes the revenue but not the cost", async () => {
	const app = createApp({ clock: createClock(Date.UTC(2026, 8, 1)) });
	const { body } = await app.call("POST", "/api/checkout", { visitor: "v1", items: [{ sku: "KT-002", qty: 1 }] });
	const before = (await app.call("GET", "/api/admin/finance")).body;
	assert.equal(before.revenueCents, 4200 + 599);
	assert.equal(before.marginCents, 4200 + 599 - 2100 - 450 - (Math.round(before.revenueCents * 0 + (4200 + 599 + 336) * 0.029) + 30));
	await app.call("POST", "/api/orders/refund", { orderId: body.orderId });
	const after = (await app.call("GET", "/api/admin/finance")).body;
	assert.equal(after.revenueCents, 0);
	assert.ok(after.marginCents < 0, "the goods and carrier cost are still ours");
});

test("the simulation is deterministic for a seed and different for another", async () => {
	const a = (await (await simulated(300, 5)).call("GET", "/api/admin/finance")).body.revenueCents;
	const b = (await (await simulated(300, 5)).call("GET", "/api/admin/finance")).body.revenueCents;
	const c = (await (await simulated(300, 6)).call("GET", "/api/admin/finance")).body.revenueCents;
	assert.equal(a, b);
	assert.notEqual(a, c);
});

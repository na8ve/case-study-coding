// The A/B testing task, as an executable check. It fails until the shop can
// run experiments; docs/ab-testing.md is the contract it checks.
//
//   npm run accept
//
// Exit code 0 only when every check passes.

import { createApp } from "../src/app.mjs";
import { createClock } from "../src/clock.mjs";
import { runSimulation } from "../sim/run.mjs";

const SHOPPERS = 60000;
const SEED = 11;

const EXPECTED = {
	free_ship_banner: { treatment: "banner", decision: "ship" },
	first_order_discount: { treatment: "fifteen_off", decision: "stop" },
	button_color: { treatment: "green", decision: "keep_running" },
};

const results = [];
async function check(name, fn) {
	try {
		await fn();
		results.push([true, name]);
	} catch (e) {
		results.push([false, `${name}: ${e.message}`]);
	}
}
function expect(cond, message) {
	if (!cond) throw new Error(message);
}

const fresh = () => createApp({ clock: createClock(Date.UTC(2026, 8, 1)) });
const storefront = async (app, visitor) => (await app.call("GET", `/api/storefront?visitor=${visitor}`)).body;

await check("each visitor is assigned to every experiment, and stays there", async () => {
	const app = fresh();
	const first = await storefront(app, "visitor-a");
	expect(first.experiments && typeof first.experiments === "object", "the storefront has no experiments object");
	expect(JSON.stringify(Object.keys(first.experiments).sort()) === JSON.stringify(Object.keys(EXPECTED).sort()), `experiments are ${Object.keys(first.experiments)}`);
	for (let i = 0; i < 5; i++) expect(JSON.stringify((await storefront(app, "visitor-a")).experiments) === JSON.stringify(first.experiments), "the assignment changed between requests");
	for (const [key, v] of Object.entries(first.experiments)) expect(["control", EXPECTED[key].treatment].includes(v), `${key} gave ${v}`);
});

await check("the split is about even, and the experiments are independent of each other", async () => {
	const app = fresh();
	const n = 3000;
	const seen = Object.fromEntries(Object.keys(EXPECTED).map((k) => [k, 0]));
	let both = 0;
	for (let i = 0; i < n; i++) {
		const { experiments } = await storefront(app, `split-${i}`);
		for (const [key, def] of Object.entries(EXPECTED)) if (experiments[key] === def.treatment) seen[key]++;
		if (experiments.free_ship_banner === "banner" && experiments.first_order_discount === "fifteen_off") both++;
	}
	for (const [key, count] of Object.entries(seen)) expect(Math.abs(count / n - 0.5) < 0.04, `${key} put ${((count / n) * 100).toFixed(1)}% in the treatment`);
	expect(Math.abs(both / n - 0.25) < 0.04, `banner and fifteen_off overlap ${((both / n) * 100).toFixed(1)}%, not about 25%`);
});

await check("an exposure is logged once per visitor and experiment, with its variant", async () => {
	const app = fresh();
	for (let i = 0; i < 20; i++) {
		await storefront(app, `exp-${i}`);
		await storefront(app, `exp-${i}`);
	}
	const exposures = app.ctx.store.events.filter((e) => e.name === "exposure");
	expect(exposures.length === 20 * Object.keys(EXPECTED).length, `${exposures.length} exposures for 20 visitors in 3 experiments`);
	const keys = new Set(exposures.map((e) => `${e.visitor}|${e.props.experiment}`));
	expect(keys.size === exposures.length, "a visitor was exposed to an experiment twice");
	expect(exposures.every((e) => typeof e.props.variant === "string"), "an exposure has no variant");
});

await check("a variant changes what the shopper is shown, and control changes nothing", async () => {
	const app = fresh();
	const base = { banner: null, autoCoupon: null };
	let sawBanner = false;
	let sawCoupon = false;
	let sawColor = false;
	const colors = new Set();
	for (let i = 0; i < 200; i++) {
		const s = await storefront(app, `show-${i}`);
		colors.add(s.cta.color);
		if (s.experiments.free_ship_banner === "banner") {
			expect(typeof s.banner === "string" && s.banner.length > 0, "the banner variant shows no banner");
			sawBanner = true;
		} else expect(s.banner === base.banner, "control shows a banner");
		if (s.experiments.first_order_discount === "fifteen_off") {
			expect(s.autoCoupon === "WELCOME15", "fifteen_off applies no coupon");
			sawCoupon = true;
		} else expect(s.autoCoupon === base.autoCoupon, "control applies a coupon");
		if (s.experiments.button_color === "green") sawColor = true;
	}
	expect(sawBanner && sawCoupon && sawColor, "a treatment never appeared in 200 visitors");
	expect(colors.size === 2, `the button has ${colors.size} colours; one experiment, so two`);
});

const app = fresh();
await runSimulation(app, { shoppers: SHOPPERS, seed: SEED });
const report = (await app.call("GET", "/api/admin/experiments")).body;

await check("the experiments report lists each experiment with its variants' numbers", async () => {
	expect(Array.isArray(report.experiments), "GET /api/admin/experiments has no experiments array");
	for (const key of Object.keys(EXPECTED)) {
		const e = report.experiments.find((x) => x.key === key);
		expect(e, `${key} is missing`);
		expect(e.variants.length === 2, `${key} has ${e.variants.length} variants`);
		for (const v of e.variants) for (const f of ["name", "visitors", "purchasers", "conversionRate", "revenuePerVisitorCents", "marginPerVisitorCents"]) expect(v[f] !== undefined, `${key}/${v.name} has no ${f}`);
		for (const f of ["lift", "pValue", "decision"]) expect(e[f] !== undefined, `${key} has no ${f}`);
		expect(e.srm && typeof e.srm.pValue === "number" && typeof e.srm.ok === "boolean", `${key} has no sample-ratio check`);
	}
});

await check("every shopper is counted once, in the arm they were assigned", async () => {
	expect(Array.isArray(report.experiments) && report.experiments.length === Object.keys(EXPECTED).length, "the report has no experiments to count");
	for (const e of report.experiments) {
		const total = e.variants.reduce((n, v) => n + v.visitors, 0);
		expect(total > 0.8 * SHOPPERS && total <= SHOPPERS, `${e.key} counts ${total} visitors out of ${SHOPPERS} shoppers`);
		expect(e.srm.ok, `${e.key} fails its own sample-ratio check`);
	}
});

for (const [key, want] of Object.entries(EXPECTED)) {
	await check(`${key}: the decision is "${want.decision}"`, async () => {
		const e = (report.experiments ?? []).find((x) => x.key === key);
		expect(e, "missing");
		expect(e.decision === want.decision, `decision is "${e.decision}" (lift ${(e.lift * 100).toFixed(1)}%, p ${e.pValue.toFixed(4)})`);
	});
}

await check("first_order_discount is stopped because it costs margin, though it lifts conversion", async () => {
	const e = (report.experiments ?? []).find((x) => x.key === "first_order_discount");
	expect(e, "missing");
	const c = e.variants.find((v) => v.name === "control");
	const t = e.variants.find((v) => v.name === "fifteen_off");
	expect(t.conversionRate > c.conversionRate, "the discount did not raise conversion");
	expect(t.marginPerVisitorCents < c.marginPerVisitorCents, "the discount did not lower margin per visitor");
});

let failed = 0;
for (const [ok, name] of results) {
	console.log(`${ok ? "pass" : "FAIL"}  ${name}`);
	if (!ok) failed++;
}
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);

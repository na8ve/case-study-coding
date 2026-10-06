import assert from "node:assert/strict";
import { test } from "node:test";
import { COUPONS } from "../src/coupons.mjs";
import { FLAT_SHIPPING_CENTS, FREE_SHIPPING_THRESHOLD_CENTS, discountFor, orderTotals, shippingFor, taxFor } from "../src/pricing.mjs";

const line = (unitCents, qty = 1) => ({ unitCents, qty });

test("prices are whole cents", () => {
	const t = orderTotals({ lines: [line(3333, 3)], coupon: COUPONS.WELCOME15, firstOrder: true });
	for (const v of Object.values(t)) assert.ok(Number.isInteger(v), `${v} is an integer`);
});

test("shipping is flat below the threshold and free at it", () => {
	assert.equal(shippingFor(FREE_SHIPPING_THRESHOLD_CENTS - 1), FLAT_SHIPPING_CENTS);
	assert.equal(shippingFor(FREE_SHIPPING_THRESHOLD_CENTS), 0);
	assert.equal(shippingFor(0), 0);
});

test("free shipping uses the discounted subtotal, not the list subtotal", () => {
	const t = orderTotals({ lines: [line(7800)], coupon: COUPONS.WELCOME15, firstOrder: true });
	assert.equal(t.discountCents, 1170);
	assert.equal(t.shippingCents, FLAT_SHIPPING_CENTS, "7800 less 15% is 6630, under the threshold");
	const free = orderTotals({ lines: [line(7800)] });
	assert.equal(free.shippingCents, 0, "control: with no coupon the same cart ships free");
});

test("a first-order coupon does nothing on a later order", () => {
	assert.equal(discountFor(5000, COUPONS.WELCOME15, true), 750);
	assert.equal(discountFor(5000, COUPONS.WELCOME15, false), 0);
});

test("a fixed coupon needs its minimum and never exceeds the subtotal", () => {
	assert.equal(discountFor(2999, COUPONS.SAVE5, false), 0);
	assert.equal(discountFor(3000, COUPONS.SAVE5, false), 500);
});

test("tax is charged on the discounted subtotal", () => {
	assert.equal(taxFor(10000), 800);
	const t = orderTotals({ lines: [line(10000)], coupon: COUPONS.WELCOME15, firstOrder: true });
	assert.equal(t.taxCents, 680);
});

test("a custom threshold changes who ships free", () => {
	assert.equal(orderTotals({ lines: [line(5000)], thresholdCents: 4000 }).shippingCents, 0);
	assert.equal(orderTotals({ lines: [line(5000)], thresholdCents: 6000 }).shippingCents, FLAT_SHIPPING_CENTS);
});

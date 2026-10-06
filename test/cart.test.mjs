import assert from "node:assert/strict";
import { test } from "node:test";
import { CartError, normalizeItems, priceCart } from "../src/cart.mjs";

test("the same sku merges and quantities are checked", () => {
	assert.deepEqual(normalizeItems([{ sku: "KT-001", qty: 1 }, { sku: "KT-001", qty: 2 }]), [{ sku: "KT-001", qty: 3 }]);
	assert.throws(() => normalizeItems([{ sku: "KT-001", qty: 0 }]), CartError);
	assert.throws(() => normalizeItems([{ sku: "KT-001", qty: 21 }]), CartError);
	assert.throws(() => normalizeItems([]), CartError);
});

test("an unknown product is refused", () => {
	assert.throws(() => priceCart([{ sku: "NOPE", qty: 1 }]), /unknown product/);
});

test("pricing a cart uses the catalogue's price and the coupon only when it applies", () => {
	const plain = priceCart([{ sku: "KT-005", qty: 2 }]);
	assert.equal(plain.totals.subtotalCents, 4800);
	assert.equal(plain.couponCode, null);
	const welcome = priceCart([{ sku: "KT-005", qty: 2 }], { couponCode: "welcome15", firstOrder: true });
	assert.equal(welcome.couponCode, "WELCOME15");
	assert.equal(welcome.totals.discountCents, 720);
	const later = priceCart([{ sku: "KT-005", qty: 2 }], { couponCode: "welcome15", firstOrder: false });
	assert.equal(later.couponCode, null, "control: a repeat customer gets no discount, so no coupon is reported");
});

test("the threshold passed in reaches shipping", () => {
	const cheap = priceCart([{ sku: "KT-001", qty: 1 }], { thresholdCents: 5000 });
	assert.equal(cheap.totals.shippingCents, 0);
	const dear = priceCart([{ sku: "KT-001", qty: 1 }], { thresholdCents: 9500 });
	assert.equal(dear.totals.shippingCents, 599);
});

import { findProduct } from "./catalog.mjs";
import { findCoupon } from "./coupons.mjs";
import { orderTotals } from "./pricing.mjs";

export class CartError extends Error {}

export function normalizeItems(raw) {
	if (!Array.isArray(raw) || raw.length === 0) throw new CartError("the cart is empty");
	const bySku = new Map();
	for (const it of raw) {
		const qty = Number(it?.qty);
		if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new CartError(`bad quantity for ${it?.sku}`);
		bySku.set(it.sku, (bySku.get(it.sku) ?? 0) + qty);
	}
	return [...bySku].map(([sku, qty]) => ({ sku, qty }));
}

export function priceCart(rawItems, { couponCode = null, firstOrder = false, thresholdCents } = {}) {
	const lines = normalizeItems(rawItems).map(({ sku, qty }) => {
		const product = findProduct(sku);
		if (!product) throw new CartError(`unknown product ${sku}`);
		return { sku, qty, name: product.name, unitCents: product.priceCents, costCents: product.costCents };
	});
	const coupon = findCoupon(couponCode);
	const totals = orderTotals({ lines, coupon, firstOrder, thresholdCents });
	return { lines, couponCode: coupon && totals.discountCents > 0 ? coupon.code : null, totals };
}

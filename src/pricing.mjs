export const FREE_SHIPPING_THRESHOLD_CENTS = 7500;
export const FLAT_SHIPPING_CENTS = 599;
export const CARRIER_COST_CENTS = 450;
export const TAX_RATE = 0.08;

export function lineTotal(unitCents, qty) {
	return unitCents * qty;
}

export function discountFor(subtotalCents, coupon, firstOrder) {
	if (!coupon) return 0;
	if (coupon.firstOrderOnly && !firstOrder) return 0;
	if (subtotalCents < coupon.minSubtotalCents) return 0;
	const raw = coupon.kind === "percent" ? Math.round((subtotalCents * coupon.value) / 100) : coupon.value;
	return Math.min(raw, subtotalCents);
}

export function shippingFor(discountedSubtotalCents, thresholdCents = FREE_SHIPPING_THRESHOLD_CENTS) {
	if (discountedSubtotalCents <= 0) return 0;
	return discountedSubtotalCents >= thresholdCents ? 0 : FLAT_SHIPPING_CENTS;
}

export function taxFor(taxableCents) {
	return Math.round(taxableCents * TAX_RATE);
}

export function orderTotals({ lines, coupon = null, firstOrder = false, thresholdCents = FREE_SHIPPING_THRESHOLD_CENTS }) {
	const subtotalCents = lines.reduce((sum, l) => sum + lineTotal(l.unitCents, l.qty), 0);
	const discountCents = discountFor(subtotalCents, coupon, firstOrder);
	const afterDiscountCents = subtotalCents - discountCents;
	const shippingCents = shippingFor(afterDiscountCents, thresholdCents);
	const taxCents = taxFor(afterDiscountCents);
	return {
		subtotalCents,
		discountCents,
		shippingCents,
		taxCents,
		totalCents: afterDiscountCents + shippingCents + taxCents,
	};
}

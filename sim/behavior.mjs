export const CHANNEL_MIX = [
	["organic", 0.34],
	["paid_search", 0.26],
	["email", 0.12],
	["social", 0.2],
	["referral", 0.08],
];

export const DEVICE_MIX = [
	["mobile", 0.6],
	["desktop", 0.34],
	["tablet", 0.06],
];

const CHANNEL_INTENT = { organic: 1, paid_search: 0.9, email: 1.3, social: 0.7, referral: 1.05 };
const DEVICE_INTENT = { mobile: 0.85, desktop: 1.15, tablet: 1 };

const P_PRODUCT_VIEW = 0.6;
const P_ADD_PER_VIEW = 0.18;
const P_CHECKOUT_START = 0.6;
const P_BUY = 0.5;
const P_RETURNING = 0.12;
const P_REFUND = 0.04;

const EXPECTED_SHIPPING_CENTS = 599;
const SHIPPING_WEIGHT = 1.5;
const PRICE_ELASTICITY = 1.2;
const BANNER_CHECKOUT_BOOST = 1.15;
const TOP_UP_WINDOW_CENTS = 2000;
const P_TOP_UP = 0.45;

export const returningShare = P_RETURNING;
export const refundShare = P_REFUND;

export function pViewProduct() {
	return P_PRODUCT_VIEW;
}

export function pAddToCart(channel, device) {
	return Math.min(0.9, P_ADD_PER_VIEW * CHANNEL_INTENT[channel] * DEVICE_INTENT[device]);
}

export function pStartCheckout() {
	return P_CHECKOUT_START;
}

export function wantsTopUp(subtotalCents, thresholdCents, banner, rand) {
	const gap = thresholdCents - subtotalCents;
	return Boolean(banner) && gap > 0 && gap <= TOP_UP_WINDOW_CENTS && rand() < P_TOP_UP;
}

export function pBuy({ channel, quote, listSubtotalCents, banner }) {
	const perceived = quote.totals.subtotalCents - quote.totals.discountCents + SHIPPING_WEIGHT * quote.totals.shippingCents;
	const expected = listSubtotalCents + SHIPPING_WEIGHT * EXPECTED_SHIPPING_CENTS;
	const sensitivity = Math.min(1.8, Math.max(0.6, (expected / Math.max(1, perceived)) ** PRICE_ELASTICITY));
	return Math.min(0.97, P_BUY * CHANNEL_INTENT[channel] * sensitivity * (banner ? BANNER_CHECKOUT_BOOST : 1));
}

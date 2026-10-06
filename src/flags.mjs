import { FREE_SHIPPING_THRESHOLD_CENTS } from "./pricing.mjs";

const STATIC_STOREFRONT = {
	banner: null,
	cta: { label: "Add to cart", color: "#1d4ed8" },
	freeShippingThresholdCents: FREE_SHIPPING_THRESHOLD_CENTS,
	autoCoupon: null,
};

export function storefrontConfig(visitor) {
	return { visitor, ...STATIC_STOREFRONT, experiments: {} };
}

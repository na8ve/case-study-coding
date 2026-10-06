export const COUPONS = {
	WELCOME15: { code: "WELCOME15", kind: "percent", value: 15, firstOrderOnly: true, minSubtotalCents: 0 },
	SAVE5: { code: "SAVE5", kind: "fixed", value: 500, firstOrderOnly: false, minSubtotalCents: 3000 },
};

export function findCoupon(code) {
	if (!code) return null;
	return COUPONS[String(code).toUpperCase()] ?? null;
}

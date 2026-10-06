export const CHANNELS = ["organic", "paid_search", "email", "social", "referral"];

export const DAILY_SPEND_CENTS = {
	organic: 0,
	paid_search: 42000,
	email: 6000,
	social: 25000,
	referral: 4000,
};

export function channelOf(utmMedium) {
	const m = String(utmMedium ?? "").toLowerCase();
	if (m === "cpc" || m === "paid_search") return "paid_search";
	if (m === "email") return "email";
	if (m === "social") return "social";
	if (m === "referral") return "referral";
	return "organic";
}

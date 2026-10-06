import { priceCart } from "./cart.mjs";
import { createOrder, isFirstOrder } from "./orders.mjs";
import { CHANNELS } from "./marketing.mjs";

export const DEVICES = ["mobile", "desktop", "tablet"];

export function placeOrder(store, clock, { visitor, items, couponCode, channel, device, thresholdCents }) {
	if (!visitor) throw new Error("an order needs a visitor");
	const priced = priceCart(items, { couponCode, firstOrder: isFirstOrder(store, visitor), thresholdCents });
	return createOrder(store, clock, {
		visitor,
		channel: CHANNELS.includes(channel) ? channel : "organic",
		device: DEVICES.includes(device) ? device : "desktop",
		priced,
	});
}

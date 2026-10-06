export const EVENT_NAMES = ["page_view", "product_view", "add_to_cart", "checkout_start", "purchase", "refund"];

export function isEventName(name) {
	return EVENT_NAMES.includes(name);
}

export function track(store, clock, name, visitor, props = {}) {
	if (!isEventName(name)) throw new Error(`unknown event ${name}`);
	if (!visitor) throw new Error("an event needs a visitor");
	const event = { id: store.events.length + 1, ts: clock.now(), name, visitor, props };
	store.events.push(event);
	return event;
}

export function eventsNamed(store, name) {
	return store.events.filter((e) => e.name === name);
}

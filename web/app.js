const money = (cents) => `$${(cents / 100).toFixed(2)}`;
const el = (tag, cls, text) => {
	const node = document.createElement(tag);
	if (cls) node.className = cls;
	if (text !== undefined) node.textContent = text;
	return node;
};

let storefront = null;
let cart = [];

function visitorId() {
	try {
		let id = localStorage.getItem("tw_visitor");
		if (!id) {
			id = `v-${crypto.randomUUID()}`;
			localStorage.setItem("tw_visitor", id);
		}
		return id;
	} catch {
		return `v-${Math.random().toString(36).slice(2)}`;
	}
}
const visitor = visitorId();

function channelFromUrl() {
	const medium = new URLSearchParams(location.search).get("utm_medium");
	if (medium === "cpc") return "paid_search";
	return ["email", "social", "referral"].includes(medium) ? medium : "organic";
}

function deviceFromViewport() {
	if (innerWidth < 640) return "mobile";
	return innerWidth < 1024 ? "tablet" : "desktop";
}

async function api(method, path, body) {
	const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
	return res.json();
}

function sendEvent(name, props = {}) {
	return api("POST", "/api/events", { visitor, name, props }).catch(() => undefined);
}

function renderBanner() {
	const box = document.getElementById("banner");
	box.hidden = !storefront.banner;
	box.textContent = storefront.banner ?? "";
}

function renderProducts(products) {
	const grid = document.getElementById("products");
	grid.replaceChildren();
	for (const p of products) {
		const card = el("div", "card");
		card.append(el("span", "cat", p.category), el("strong", null, p.name), el("span", "price", money(p.priceCents)));
		const button = el("button", "cta", storefront.cta.label);
		button.style.background = storefront.cta.color;
		button.addEventListener("click", () => addToCart(p));
		card.addEventListener("mouseenter", () => sendEvent("product_view", { sku: p.sku }), { once: true });
		card.append(button);
		grid.append(card);
	}
}

function addToCart(product) {
	const line = cart.find((l) => l.sku === product.sku);
	if (line) line.qty += 1;
	else cart.push({ sku: product.sku, qty: 1 });
	sendEvent("add_to_cart", { sku: product.sku });
	renderCart();
}

async function renderCart() {
	const lines = document.getElementById("cart-lines");
	const totals = document.getElementById("cart-totals");
	lines.replaceChildren();
	totals.replaceChildren();
	if (!cart.length) {
		lines.append(el("p", "note", "Nothing yet."));
		return;
	}
	const coupon = document.getElementById("coupon").value.trim() || storefront.autoCoupon;
	const quote = await api("POST", "/api/quote", { visitor, items: cart, coupon });
	if (quote.error) return lines.append(el("p", "note", quote.error));
	for (const l of quote.lines) {
		const row = el("div", "line");
		row.append(el("span", null, `${l.name} x ${l.qty}`), el("span", null, money(l.unitCents * l.qty)));
		lines.append(row);
	}
	const t = quote.totals;
	const add = (label, value, cls) => {
		const row = el("div", `line${cls ? ` ${cls}` : ""}`);
		row.append(el("span", null, label), el("span", null, value));
		totals.append(row);
	};
	add("Subtotal", money(t.subtotalCents));
	if (t.discountCents) add("Discount", `-${money(t.discountCents)}`);
	add("Shipping", t.shippingCents ? money(t.shippingCents) : "Free");
	add("Tax", money(t.taxCents));
	add("Total", money(t.totalCents), "total");
}

async function startCheckout() {
	if (!cart.length) return;
	await sendEvent("checkout_start");
	const coupon = document.getElementById("coupon").value.trim() || storefront.autoCoupon;
	const out = await api("POST", "/api/checkout", { visitor, items: cart, coupon, channel: channelFromUrl(), device: deviceFromViewport() });
	const note = document.getElementById("cart-note");
	if (out.error) {
		note.textContent = out.error;
		return;
	}
	cart = [];
	note.textContent = `Order ${out.orderId} placed. Total ${money(out.totalCents)}. Synthetic: nothing was charged.`;
	renderCart();
}

async function loadStorefront() {
	storefront = await api("GET", `/api/storefront?visitor=${encodeURIComponent(visitor)}`);
	renderBanner();
	const { products } = await api("GET", "/api/products");
	renderProducts(products);
	sendEvent("page_view", { channel: channelFromUrl(), device: deviceFromViewport() });
	renderCart();
}

document.getElementById("checkout").addEventListener("click", startCheckout);
document.getElementById("coupon").addEventListener("change", renderCart);
loadStorefront();

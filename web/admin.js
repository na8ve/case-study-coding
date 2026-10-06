const SVG = "http://www.w3.org/2000/svg";
const money = (cents) => (cents === null || cents === undefined ? "-" : `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`);
const pct = (x) => (x === null || x === undefined ? "-" : `${(x * 100).toFixed(1)}%`);

const el = (tag, cls, text) => {
	const node = document.createElement(tag);
	if (cls) node.className = cls;
	if (text !== undefined) node.textContent = text;
	return node;
};

const svgEl = (tag, attrs = {}) => {
	const node = document.createElementNS(SVG, tag);
	for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
	return node;
};

function tileRow(items) {
	const row = el("div", "tiles");
	for (const [label, value] of items) {
		const tile = el("div", "tile");
		tile.append(el("div", "label", label), el("div", "value", value));
		row.append(tile);
	}
	return row;
}

function drawBars(title, rows) {
	const box = el("div", "chart");
	box.append(el("h3", null, title));
	const w = 640;
	const rowH = 26;
	const svg = svgEl("svg", { viewBox: `0 0 ${w} ${rows.length * rowH + 6}`, width: "100%", role: "img" });
	const max = Math.max(1, ...rows.map((r) => r.value));
	rows.forEach((r, i) => {
		const y = i * rowH + 4;
		const label = svgEl("text", { x: 0, y: y + 14 });
		label.textContent = r.label;
		svg.append(label);
		svg.append(svgEl("rect", { class: "bar-fill", x: 150, y, height: 16, rx: 3, width: Math.max(2, (r.value / max) * (w - 260)) }));
		const val = svgEl("text", { x: 150 + Math.max(2, (r.value / max) * (w - 260)) + 6, y: y + 13 });
		val.textContent = r.text;
		svg.append(val);
	});
	box.append(svg);
	return box;
}

function drawLine(title, points, format) {
	const box = el("div", "chart");
	box.append(el("h3", null, title));
	const w = 640;
	const h = 160;
	const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h + 24}`, width: "100%", role: "img" });
	if (points.length > 1) {
		const max = Math.max(1, ...points.map((p) => p.value));
		const min = Math.min(0, ...points.map((p) => p.value));
		const x = (i) => 40 + (i / (points.length - 1)) * (w - 60);
		const y = (v) => h - ((v - min) / (max - min || 1)) * (h - 12) + 4;
		svg.append(svgEl("polyline", { class: "line-stroke", points: points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ") }));
		const top = svgEl("text", { x: 0, y: 14 });
		top.textContent = format(max);
		const first = svgEl("text", { x: 40, y: h + 18 });
		first.textContent = points[0].day;
		const last = svgEl("text", { x: w - 80, y: h + 18 });
		last.textContent = points.at(-1).day;
		svg.append(top, first, last);
	}
	box.append(svg);
	return box;
}

function table(head, rows) {
	const t = el("table");
	const tr = el("tr");
	for (const h of head) tr.append(el("th", null, h));
	t.append(tr);
	for (const r of rows) {
		const row = el("tr");
		for (const c of r) row.append(el("td", null, String(c)));
		t.append(row);
	}
	return t;
}

const VIEWS = {
	behavior: {
		label: "Customer behavior",
		endpoint: "/api/admin/behavior",
		render(r) {
			const buy = r.funnel.at(-1);
			return [
				tileRow([
					["Visitors", r.visitors.toLocaleString()],
					["Purchasers", buy.visitors.toLocaleString()],
					["Conversion", pct(buy.rateFromStart)],
				]),
				drawBars(
					"Funnel (unique visitors)",
					r.funnel.map((s) => ({ label: s.name.replace("_", " "), value: s.visitors, text: `${s.visitors} (${pct(s.rateFromStart)})` })),
				),
				drawLine("Daily visitors", r.dailyVisitors, (v) => String(v)),
				table(["Device", "Visitors", "Purchasers", "Conversion"], r.byDevice.map((d) => [d.device, d.visitors, d.purchasers, pct(d.conversionRate)])),
			];
		},
	},
	marketing: {
		label: "Marketing",
		endpoint: "/api/admin/marketing",
		render(r) {
			const paid = r.channels.filter((c) => c.spendCents > 0);
			const spend = paid.reduce((n, c) => n + c.spendCents, 0);
			const revenue = paid.reduce((n, c) => n + c.revenueCents, 0);
			return [
				tileRow([
					["Paid spend", money(spend)],
					["Revenue from paid", money(revenue)],
					["Blended ROAS", spend ? (revenue / spend).toFixed(2) : "-"],
				]),
				drawBars(
					"Revenue by channel",
					r.channels.map((c) => ({ label: c.channel, value: c.revenueCents, text: money(c.revenueCents) })),
				),
				table(
					["Channel", "Visitors", "Orders", "Conversion", "Spend", "CAC", "ROAS"],
					r.channels.map((c) => [c.channel, c.visitors, c.orders, pct(c.conversionRate), money(c.spendCents), money(c.cacCents), c.roas === null ? "-" : c.roas.toFixed(2)]),
				),
			];
		},
	},
	finance: {
		label: "Finance",
		endpoint: "/api/admin/finance",
		render(r) {
			return [
				tileRow([
					["Revenue", money(r.revenueCents)],
					["Contribution margin", money(r.marginCents)],
					["Margin rate", pct(r.marginRate)],
					["Average order", money(r.averageOrderCents)],
					["Refunded", money(r.refundedCents)],
				]),
				drawLine("Daily revenue", r.dailyRevenue, (v) => money(v)),
				drawLine("Daily contribution margin", r.dailyMargin, (v) => money(v)),
				table(
					["Line", "Amount"],
					[
						["Revenue kept", money(r.revenueCents)],
						["Cost of goods", money(r.cogsCents)],
						["Carrier cost", money(r.shippingCostCents)],
						["Payment fees", money(r.feesCents)],
						["Discounts given", money(r.discountCents)],
					],
				),
			];
		},
	},
};

const tabs = document.getElementById("tabs");
const panel = document.getElementById("panel");
let current = "behavior";

async function show(name) {
	current = name;
	for (const b of tabs.children) b.setAttribute("aria-selected", String(b.dataset.view === name));
	const res = await fetch(VIEWS[name].endpoint);
	panel.replaceChildren(...VIEWS[name].render(await res.json()));
}

for (const [name, view] of Object.entries(VIEWS)) {
	const b = el("button", null, view.label);
	b.dataset.view = name;
	b.setAttribute("role", "tab");
	b.addEventListener("click", () => show(name));
	tabs.append(b);
}

document.getElementById("simulate").addEventListener("click", async (ev) => {
	ev.target.disabled = true;
	await fetch("/api/dev/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shoppers: 1000, seed: Date.now() % 100000 }) });
	ev.target.disabled = false;
	show(current);
});

show(current);

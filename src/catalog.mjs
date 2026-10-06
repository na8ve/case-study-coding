export const CATEGORIES = ["kitchen", "outdoor", "desk", "home"];

export const PRODUCTS = [
	{ sku: "KT-001", name: "Enamel Dutch Oven", category: "kitchen", priceCents: 8900, costCents: 4600 },
	{ sku: "KT-002", name: "Carbon Steel Pan", category: "kitchen", priceCents: 4200, costCents: 2100 },
	{ sku: "KT-003", name: "Walnut Cutting Board", category: "kitchen", priceCents: 3400, costCents: 1500 },
	{ sku: "KT-004", name: "Pour-over Kettle", category: "kitchen", priceCents: 5600, costCents: 2800 },
	{ sku: "KT-005", name: "Linen Apron", category: "kitchen", priceCents: 2400, costCents: 900 },
	{ sku: "OD-001", name: "Packable Rain Shell", category: "outdoor", priceCents: 9900, costCents: 5200 },
	{ sku: "OD-002", name: "Insulated Bottle", category: "outdoor", priceCents: 2800, costCents: 1100 },
	{ sku: "OD-003", name: "Trail Daypack", category: "outdoor", priceCents: 7400, costCents: 3700 },
	{ sku: "OD-004", name: "Merino Socks (3 pack)", category: "outdoor", priceCents: 3000, costCents: 1300 },
	{ sku: "OD-005", name: "Headlamp", category: "outdoor", priceCents: 3900, costCents: 1900 },
	{ sku: "DK-001", name: "Dot Grid Notebook", category: "desk", priceCents: 1600, costCents: 600 },
	{ sku: "DK-002", name: "Brass Pen", category: "desk", priceCents: 4800, costCents: 2000 },
	{ sku: "DK-003", name: "Felt Desk Mat", category: "desk", priceCents: 3600, costCents: 1500 },
	{ sku: "DK-004", name: "Monitor Riser", category: "desk", priceCents: 6200, costCents: 3100 },
	{ sku: "DK-005", name: "Cable Roll", category: "desk", priceCents: 1400, costCents: 500 },
	{ sku: "HM-001", name: "Stoneware Mug Set", category: "home", priceCents: 3800, costCents: 1700 },
	{ sku: "HM-002", name: "Wool Throw", category: "home", priceCents: 8400, costCents: 4300 },
	{ sku: "HM-003", name: "Soy Candle", category: "home", priceCents: 2200, costCents: 800 },
	{ sku: "HM-004", name: "Ceramic Planter", category: "home", priceCents: 2900, costCents: 1200 },
	{ sku: "HM-005", name: "Oak Wall Hooks", category: "home", priceCents: 1900, costCents: 700 },
];

export function findProduct(sku) {
	return PRODUCTS.find((p) => p.sku === sku) ?? null;
}

export function listProducts(category = null) {
	return category ? PRODUCTS.filter((p) => p.category === category) : PRODUCTS;
}

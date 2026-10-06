export function rngFor(seed, index = 0) {
	let a = (Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function pickWeighted(rand, pairs) {
	let r = rand() * pairs.reduce((n, [, w]) => n + w, 0);
	for (const [value, w] of pairs) {
		r -= w;
		if (r <= 0) return value;
	}
	return pairs[pairs.length - 1][0];
}

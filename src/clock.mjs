export const systemClock = { now: () => Date.now() };

export function createClock(startMs) {
	let t = startMs;
	return {
		now: () => t,
		set(ms) {
			t = ms;
		},
	};
}

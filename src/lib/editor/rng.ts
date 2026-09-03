// Deterministic per-issue randomness — same seed, same sheet, every render.

export interface Rng {
	(): number; // 0..1
	range(a: number, b: number): number;
	int(a: number, b: number): number;
	pick<T>(arr: readonly T[]): T;
	chance(p: number): boolean;
	sign(): number;
	gauss(): number; // ~N(0,1)
}

export function makeRng(seed: number): Rng {
	let s = seed >>> 0 || 1;
	const next = () => {
		s = (s + 0x6d2b79f5) | 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const r = next as Rng;
	r.range = (a, b) => a + next() * (b - a);
	r.int = (a, b) => Math.floor(a + next() * (b - a + 1));
	r.pick = (arr) => arr[Math.floor(next() * arr.length)];
	r.chance = (p) => next() < p;
	r.sign = () => (next() < 0.5 ? -1 : 1);
	r.gauss = () => {
		// Box–Muller
		const u = Math.max(1e-9, next());
		const v = next();
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	};
	return r;
}

/** Turn any string into a stable numeric seed. */
export function seedFrom(str: string): number {
	let h = 2166136261;
	for (let i = 0; i < str.length; i++) {
		h ^= str.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

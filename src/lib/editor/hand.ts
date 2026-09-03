// A drawing hand: wobbly strokes, sketched ellipses, hatching, marginal marks.
// Everything takes a `progress` (0..1) so it can be inked in as you scroll.

import type { Rng } from './rng';

export type Pt = { x: number; y: number };

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A hand-drawn line from a→b: slight bow, endpoint jitter, mid wobble. */
export function line(a: Pt, b: Pt, rng: Rng, wobble = 1): Pt[] {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const len = Math.hypot(dx, dy) || 1;
	const nx = -dy / len;
	const ny = dx / len;
	const bow = rng.gauss() * Math.min(len * 0.04, 9) * wobble;
	const n = Math.max(6, Math.round(len / 22));
	const pts: Pt[] = [];
	const jA = { x: rng.gauss() * 1.5, y: rng.gauss() * 1.5 };
	const jB = { x: rng.gauss() * 1.5, y: rng.gauss() * 1.5 };
	for (let i = 0; i <= n; i++) {
		const t = i / n;
		const hump = Math.sin(t * Math.PI);
		const w = (Math.sin(t * 9 + rng() * 6) * 0.5 + rng.gauss() * 0.4) * wobble;
		pts.push({
			x: lerp(a.x + jA.x, b.x + jB.x, t) + nx * (bow * hump + w),
			y: lerp(a.y + jA.y, b.y + jB.y, t) + ny * (bow * hump + w),
		});
	}
	return pts;
}

/** A loose ellipse that opens/overshoots like a real circling gesture. */
export function ellipse(cx: number, cy: number, rx: number, ry: number, rng: Rng): Pt[] {
	const N = 132;
	const start = -Math.PI * 0.5 + rng.range(-0.35, 0.35);
	const sweep = Math.PI * 2 + rng.range(0.15, 0.6);
	const w1 = rng.range(2, 3.6);
	const w2 = rng.range(3.6, 6.5);
	const p1 = rng() * 7;
	const p2 = rng() * 7;
	const amp = rng.range(0.03, 0.07);
	const skew = rng.range(-0.12, 0.12);
	const pts: Pt[] = [];
	for (let i = 0; i <= N; i++) {
		const f = i / N;
		const ang = start + sweep * f;
		const r = 1 + (Math.sin(ang * w1 + p1) * 0.55 + Math.sin(ang * w2 + p2) * 0.45) * amp + (f - 0.5) * 0.02;
		pts.push({
			x: cx + Math.cos(ang) * rx * r - Math.sin(ang) * ry * skew,
			y: cy + Math.sin(ang) * ry * r,
		});
	}
	return pts;
}

export function strokePath(
	ctx: CanvasRenderingContext2D,
	pts: Pt[],
	progress: number,
	opts: { color: string; width: number; alpha?: number } = { color: '#000', width: 2 },
) {
	if (pts.length < 2 || progress <= 0) return;
	const last = pts.length - 1;
	const reach = progress * last;
	const n = Math.min(last, Math.floor(reach));
	ctx.save();
	ctx.globalAlpha = opts.alpha ?? 1;
	ctx.strokeStyle = opts.color;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.lineWidth = opts.width;
	ctx.beginPath();
	ctx.moveTo(pts[0].x, pts[0].y);
	for (let i = 1; i <= n; i++) ctx.lineTo(pts[i].x, pts[i].y);
	const frac = reach - n;
	if (frac > 0 && n < last) {
		ctx.lineTo(pts[n].x + (pts[n + 1].x - pts[n].x) * frac, pts[n].y + (pts[n + 1].y - pts[n].y) * frac);
	}
	ctx.stroke();
	ctx.restore();
}

/** Scribbled hatching inside a rect — for shading a figure or a block. */
export function hatch(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	rng: Rng,
	progress: number,
	color: string,
) {
	const gap = rng.range(7, 12);
	const angle = rng.range(-0.9, -0.5);
	const lines: Pt[][] = [];
	for (let d = -h; d < w + h; d += gap) {
		const a = { x: x + d, y: y };
		const b = { x: x + d + h / Math.tan(angle), y: y + h };
		lines.push(line(a, b, rng, 0.6));
	}
	const shown = Math.floor(progress * lines.length);
	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, w, h);
	ctx.clip();
	for (let i = 0; i < shown; i++) {
		strokePath(ctx, lines[i], 1, { color, width: 1, alpha: 0.5 });
	}
	if (shown < lines.length) {
		strokePath(ctx, lines[shown], (progress * lines.length) % 1, { color, width: 1, alpha: 0.5 });
	}
	ctx.restore();
}

export function asterisk(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rng: Rng, progress: number, color: string) {
	const arms = rng.int(3, 4);
	for (let i = 0; i < arms; i++) {
		const a = (i / arms) * Math.PI + rng.range(-0.2, 0.2);
		const p = line({ x: cx - Math.cos(a) * r, y: cy - Math.sin(a) * r }, { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }, rng, 0.8);
		strokePath(ctx, p, progress, { color, width: 2 });
	}
}

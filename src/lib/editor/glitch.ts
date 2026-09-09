// Hard-edged, machine-drawn marks for the editor view: straight rules,
// registration brackets, crosshairs, data bars, RGB channel split, scan noise.
// No wobble — everything here is a signal, not a gesture.

import type { Rng } from './rng';

export interface StrokeOpts {
	color: string;
	width?: number;
	alpha?: number;
}

/** A dead-straight line, revealed left→right (or top→bottom) by `progress`. */
export function rule(
	ctx: CanvasRenderingContext2D,
	x1: number,
	y1: number,
	x2: number,
	y2: number,
	progress: number,
	o: StrokeOpts,
) {
	if (progress <= 0) return;
	const p = Math.min(1, progress);
	ctx.save();
	ctx.globalAlpha = o.alpha ?? 1;
	ctx.strokeStyle = o.color;
	ctx.lineWidth = o.width ?? 2;
	ctx.beginPath();
	ctx.moveTo(x1, y1);
	ctx.lineTo(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p);
	ctx.stroke();
	ctx.restore();
}

/** A rule broken into blocks — reads like a progress bar / tape strip. */
export function dataBar(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	progress: number,
	o: StrokeOpts & { seg?: number; gap?: number },
) {
	const seg = o.seg ?? 14;
	const gap = o.gap ?? 6;
	const h = o.width ?? 5;
	const n = Math.floor(w / (seg + gap));
	const shown = Math.round(n * Math.min(1, progress));
	ctx.save();
	ctx.globalAlpha = o.alpha ?? 1;
	ctx.fillStyle = o.color;
	for (let i = 0; i < shown; i++) ctx.fillRect(x + i * (seg + gap), y, seg, h);
	ctx.restore();
}

/** Corner registration brackets around a rect. */
export function brackets(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	progress: number,
	o: StrokeOpts & { len?: number },
) {
	const L = o.len ?? 26;
	const p = Math.min(1, progress) * L;
	ctx.save();
	ctx.globalAlpha = o.alpha ?? 1;
	ctx.strokeStyle = o.color;
	ctx.lineWidth = o.width ?? 2;
	const corner = (cx: number, cy: number, sx: number, sy: number) => {
		ctx.beginPath();
		ctx.moveTo(cx + sx * p, cy);
		ctx.lineTo(cx, cy);
		ctx.lineTo(cx, cy + sy * p);
		ctx.stroke();
	};
	corner(x, y, 1, 1);
	corner(x + w, y, -1, 1);
	corner(x + w, y + h, -1, -1);
	corner(x, y + h, 1, -1);
	ctx.restore();
}

/** A `+` targeting mark. */
export function crosshair(
	ctx: CanvasRenderingContext2D,
	cx: number,
	cy: number,
	r: number,
	progress: number,
	o: StrokeOpts,
) {
	const p = Math.min(1, progress) * r;
	ctx.save();
	ctx.globalAlpha = o.alpha ?? 1;
	ctx.strokeStyle = o.color;
	ctx.lineWidth = o.width ?? 1.5;
	ctx.beginPath();
	ctx.moveTo(cx - p, cy);
	ctx.lineTo(cx + p, cy);
	ctx.moveTo(cx, cy - p);
	ctx.lineTo(cx, cy + p);
	ctx.stroke();
	ctx.restore();
}

/** Scattered hard rectangles — datamosh speckle. */
export function noiseBlocks(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	rng: Rng,
	count: number,
	colors: string[],
	progress = 1,
) {
	ctx.save();
	for (let i = 0; i < count; i++) {
		if (rng() > progress) continue;
		const bw = rng.range(4, 26);
		const bh = rng.range(2, 8);
		ctx.globalAlpha = rng.range(0.25, 0.8);
		ctx.fillStyle = colors[rng.int(0, colors.length - 1)];
		ctx.fillRect(x + rng.range(0, w - bw), y + rng.range(0, h - bh), bw, bh);
	}
	ctx.restore();
}

/** Horizontal slice displacement across a region — the classic tear. */
export function sliceGlitch(
	ctx: CanvasRenderingContext2D,
	src: HTMLCanvasElement,
	x: number,
	y: number,
	w: number,
	h: number,
	rng: Rng,
	intensity: number,
) {
	if (intensity <= 0) return;
	const cuts = Math.round(2 + intensity * 5);
	for (let i = 0; i < cuts; i++) {
		const sy = rng.range(0, h);
		const sh = rng.range(3, 22);
		const dx = rng.range(-1, 1) * (10 + intensity * 40);
		ctx.drawImage(src, x, y + sy, w, sh, x + dx, y + sy, w, sh);
	}
}

const SCRAMBLE = '01<>/\\[]{}#%*+=~|:.';
export function scrambleChars(n: number): string {
	let s = '';
	for (let i = 0; i < n; i++) s += SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
	return s;
}

/** A CRT tile: faint scanlines + sparse RGB speckle. Used by the sheet grain. */
export function crtTile(size = 160, alpha = 1): HTMLCanvasElement {
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const g = c.getContext('2d')!;
	const im = g.createImageData(size, size);
	const d = im.data;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const i = (y * size + x) * 4;
			const scan = y % 3 === 0 ? 26 : 0; // dark line every 3px
			const r = Math.random();
			if (r > 0.992) {
				d[i] = 255;
				d[i + 3] = 30 * alpha;
			} else if (r > 0.986) {
				d[i] = 255;
				d[i + 1] = 40;
				d[i + 2] = 70;
				d[i + 3] = 26 * alpha;
			} else if (r < 0.006) {
				d[i] = 40;
				d[i + 1] = 230;
				d[i + 2] = 255;
				d[i + 3] = 22 * alpha;
			} else {
				d[i] = d[i + 1] = d[i + 2] = 0;
				d[i + 3] = scan * alpha;
			}
		}
	}
	g.putImageData(im, 0, 0);
	return c;
}

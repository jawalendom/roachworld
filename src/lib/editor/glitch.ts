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

// ── animated layers ─────────────────────────────────────────────────────────

/** Stable 0..1 hash of a few integers — per-frame randomness that doesn't
 *  disturb the sheet's seeded layout rng. */
export function hash(a: number, b = 0, c = 0): number {
	let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2246822519);
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const RAIN = '01<>/\\[]{}#%*+=~|:.$@&?!ABCDEF▚▞░▒▓';

export interface FieldOpts {
	colors: string[]; // accent palette for blocks/tears
	glyph: string; // colour of the drifting static
	mono: (px: number) => string;
}

/** The live background: drifting glyph static, datamosh blocks, tear lines,
 *  a rolling CRT band and the odd full-screen colour hit. `energy` (scroll
 *  speed) pushes everything harder. */
export function glitchField(
	ctx: CanvasRenderingContext2D,
	info: { W: number; vh: number; t: number; sy: number; energy: number; reduce: boolean },
	o: FieldOpts,
) {
	const { W, vh, energy } = info;
	const t = info.reduce ? 0 : info.t;
	const step = Math.floor(t * 12); // 12 fps "steppy" clock for the noise
	const amp = 0.55 + energy * 1.6;

	// drifting glyph static — columns falling at their own speeds
	const px = W < 620 ? 11 : 13;
	ctx.font = o.mono(px);
	ctx.textBaseline = 'top';
	const colW = px * 1.6;
	const cols = Math.ceil(W / colW);
	for (let c = 0; c < cols; c++) {
		const speed = 18 + hash(c, 1) * 70;
		const len = 6 + Math.floor(hash(c, 2) * 18);
		const head = ((t * speed + hash(c, 3) * vh * 2 + info.sy * 0.15) % (vh + len * px * 1.3)) - len * px;
		for (let r = 0; r < len; r++) {
			const y = head - r * px * 1.3;
			if (y < -px || y > vh) continue;
			const fade = 1 - r / len;
			ctx.globalAlpha = (r === 0 ? 0.32 : 0.11 * fade) * amp;
			ctx.fillStyle = r === 0 ? o.colors[0] : o.glyph;
			const g = RAIN[Math.floor(hash(c, r, step >> (r === 0 ? 0 : 2)) * RAIN.length)];
			ctx.fillText(g, c * colW, y);
		}
	}

	// datamosh blocks — reshuffled every step
	const nBlocks = Math.round(10 + energy * 40);
	for (let i = 0; i < nBlocks; i++) {
		const h0 = hash(step, i, 7);
		if (h0 > 0.75 + energy * 0.2) continue;
		const bw = 6 + hash(step, i, 8) * (hash(step, i, 9) > 0.9 ? 260 : 40);
		const bh = 2 + hash(step, i, 10) * 9;
		ctx.globalAlpha = (0.12 + hash(step, i, 11) * 0.4) * amp;
		ctx.fillStyle = o.colors[Math.floor(hash(step, i, 12) * o.colors.length)];
		ctx.fillRect(hash(step, i, 13) * W, hash(step, i, 14) * vh, bw, bh);
	}

	// full-width tear lines
	const tears = Math.floor(hash(step, 99) * 3 + energy * 6);
	for (let i = 0; i < tears; i++) {
		ctx.globalAlpha = (0.1 + hash(step, i, 21) * 0.25) * amp;
		ctx.fillStyle = o.colors[Math.floor(hash(step, i, 22) * o.colors.length)];
		ctx.fillRect(0, hash(step, i, 23) * vh, W, 1 + hash(step, i, 24) * 2);
	}

	// rolling CRT band
	const bandY = ((t * 0.16) % 1.3) * vh - vh * 0.15;
	const band = ctx.createLinearGradient(0, bandY - 70, 0, bandY + 70);
	band.addColorStop(0, 'rgba(0,255,156,0)');
	band.addColorStop(0.5, `rgba(0,255,156,${0.05 * amp})`);
	band.addColorStop(1, 'rgba(0,255,156,0)');
	ctx.globalAlpha = 1;
	ctx.fillStyle = band;
	ctx.fillRect(0, bandY - 70, W, 140);

	// the odd full-screen colour hit
	if (hash(step, 555) < 0.025 + energy * 0.08) {
		ctx.globalAlpha = 0.05 + hash(step, 556) * 0.07;
		ctx.fillStyle = o.colors[Math.floor(hash(step, 557) * o.colors.length)];
		ctx.fillRect(0, 0, W, vh);
	}
	ctx.globalAlpha = 1;
}

/** Full-frame horizontal tear: re-blits a few bands of the finished frame
 *  sideways. Rare when idle, frequent when scrolling hard. */
export function frameTear(
	ctx: CanvasRenderingContext2D,
	canvas: HTMLCanvasElement,
	info: { W: number; vh: number; t: number; energy: number; reduce: boolean; dpr: number },
) {
	if (info.reduce) return;
	const step = Math.floor(info.t * 12);
	const burst = hash(step, 777) < 0.04 + info.energy * 0.35;
	if (!burst) return;
	const { dpr } = info;
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	const n = 1 + Math.floor(hash(step, 778) * 4);
	for (let i = 0; i < n; i++) {
		const y = Math.floor(hash(step, i, 780) * info.vh * dpr);
		const h = Math.floor((4 + hash(step, i, 781) * 40) * dpr);
		const dx = Math.round((hash(step, i, 782) - 0.5) * (30 + info.energy * 120) * dpr);
		ctx.drawImage(canvas, 0, y, canvas.width, h, dx, y, canvas.width, h);
	}
}

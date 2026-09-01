// Risograph look, done honestly: draw each ink on its own layer, then stamp the
// layers back down slightly out of register with a `multiply` blend so overlaps
// darken like real ink. A static grain tile sits on top of everything.

import { INK, type InkName } from '../../consts';

export type Ctx2D = CanvasRenderingContext2D;

export interface RisoLayer {
	readonly name: InkName;
	readonly ctx: Ctx2D;
	readonly canvas: HTMLCanvasElement;
}

export interface RisoPage {
	width: number;
	height: number;
	dpr: number;
	layers: Record<InkName, RisoLayer>;
}

const INK_ORDER: InkName[] = ['blue', 'pink', 'black'];

function makeCanvas(w: number, h: number, dpr: number): [HTMLCanvasElement, Ctx2D] {
	const c = document.createElement('canvas');
	c.width = Math.round(w * dpr);
	c.height = Math.round(h * dpr);
	const ctx = c.getContext('2d')!;
	ctx.scale(dpr, dpr);
	return [c, ctx];
}

export function createPage(width: number, height: number, dpr = Math.min(devicePixelRatio || 1, 2)): RisoPage {
	const layers = {} as Record<InkName, RisoLayer>;
	for (const name of INK_ORDER) {
		const [canvas, ctx] = makeCanvas(width, height, dpr);
		ctx.fillStyle = INK[name];
		ctx.strokeStyle = INK[name];
		ctx.textBaseline = 'alphabetic';
		layers[name] = { name, ctx, canvas };
	}
	return { width, height, dpr, layers };
}

// Deterministic jitter per ink so a re-render doesn't shimmer.
const REGISTER: Record<InkName, [number, number]> = {
	blue: [-1.6, 1.1],
	pink: [1.3, -0.9],
	black: [0.2, 0.35],
	paper: [0, 0],
};

export function compositePage(target: Ctx2D, page: RisoPage) {
	target.save();
	// Newsprint ground.
	target.fillStyle = INK.paper;
	target.fillRect(0, 0, page.width, page.height);

	target.globalCompositeOperation = 'multiply';
	for (const name of INK_ORDER) {
		const [dx, dy] = REGISTER[name];
		target.drawImage(
			page.layers[name].canvas,
			dx,
			dy,
			page.width,
			page.height,
		);
	}
	target.restore();

	applyGrain(target, page.width, page.height);
}

// ── Grain ───────────────────────────────────────────────────────────────────
let grainTile: HTMLCanvasElement | null = null;

function buildGrainTile(): HTMLCanvasElement {
	const size = 140;
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const ctx = c.getContext('2d')!;
	const img = ctx.createImageData(size, size);
	for (let i = 0; i < img.data.length; i += 4) {
		const v = 128 + (Math.random() - 0.5) * 210;
		img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
		img.data[i + 3] = Math.random() * 26;
	}
	ctx.putImageData(img, 0, 0);
	return c;
}

export function applyGrain(target: Ctx2D, w: number, h: number) {
	if (!grainTile) grainTile = buildGrainTile();
	target.save();
	target.globalCompositeOperation = 'multiply';
	const pattern = target.createPattern(grainTile, 'repeat');
	if (pattern) {
		target.fillStyle = pattern;
		target.fillRect(0, 0, w, h);
	}
	target.restore();
}

// ── Duotone images ──────────────────────────────────────────────────────────
// Map an image's luminance onto a single ink's coverage, so photos read as
// one-colour halftone-ish plates rather than full colour.
export function drawDuotone(
	layer: RisoLayer,
	img: CanvasImageSource,
	x: number,
	y: number,
	w: number,
	h: number,
	opts: { contrast?: number; floor?: number } = {},
) {
	const { contrast = 1.25, floor = 0.06 } = opts;
	const dpr = Math.min(devicePixelRatio || 1, 2);
	const [tmp, tctx] = makeCanvas(w, h, dpr);
	tctx.drawImage(img, 0, 0, w, h);
	const data = tctx.getImageData(0, 0, tmp.width, tmp.height);
	const d = data.data;
	for (let i = 0; i < d.length; i += 4) {
		const lum = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
		let cov = 1 - lum; // dark areas → more ink
		cov = Math.min(1, Math.max(0, (cov - 0.5) * contrast + 0.5));
		cov = floor + cov * (1 - floor);
		d[i] = d[i + 1] = d[i + 2] = 255;
		d[i + 3] = cov * 255;
	}
	tctx.putImageData(data, 0, 0);

	const { ctx } = layer;
	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, w, h);
	ctx.clip();
	ctx.fillStyle = layer.ctx.fillStyle;
	ctx.fillRect(x, y, w, h);
	ctx.globalCompositeOperation = 'destination-in';
	ctx.drawImage(tmp, x, y, w, h);
	ctx.restore();
}

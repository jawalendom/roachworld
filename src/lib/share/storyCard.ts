// Renders an article's "Share to Story" card: a 1080×1920 vertical image in the
// zine's Editor's View key (warm black, bone ink, acid-yellow + periwinkle
// hand marks). Runs entirely client-side on a canvas so it stays in sync with
// the article and needs no build step. Returns a PNG Blob.

import qrcode from 'qrcode-generator';
import { FONT, fontsReady, resolveFamilies } from '../pretext/fonts';
import { layoutInk, drawInk, fitInk } from '../editor/ink';
import { line, ellipse, strokePath, asterisk, type Pt } from '../editor/hand';
import { makeRng, seedFrom } from '../editor/rng';

export interface StoryCardData {
	kicker: string;
	issueNo: number;
	order: number;
	title: string;
	byline: string;
	quote?: string | null;
	heroUrl?: string | null;
	roachUrl?: string | null;
	/** canonical article URL — shown on the card and used as the share deep link */
	url: string;
	/** short domain label, e.g. "jawalendom.github.io/roachworld" */
	siteLabel: string;
}

const W = 1080;
const H = 1920;

const GROUND = '#14110c';
const INK = '#ede7d6';
const DIM = '#8a8272';
const YELLOW = '#ffec4d';
const BLUE = '#4d5fff';

const EDGE = 96;
const COL = W - EDGE * 2; // 888

function loadImage(src?: string | null): Promise<HTMLImageElement | null> {
	if (!src) return Promise.resolve(null);
	return new Promise((resolve) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = src;
	});
}

/** keep the pull quote to a card-friendly length, breaking on a word. */
function clampQuote(q?: string | null): string {
	const s = (q ?? '').trim().replace(/\s+/g, ' ');
	if (!s) return '';
	if (s.length <= 150) return s;
	const cut = s.slice(0, 150);
	return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:—-]$/, '') + '…';
}

function hexRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** cover-fit an image into (dw, dh), baked as a bone-ink duotone. */
function duotone(img: HTMLImageElement, dw: number, dh: number): HTMLCanvasElement {
	const c = document.createElement('canvas');
	c.width = dw;
	c.height = dh;
	const g = c.getContext('2d')!;
	const s = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
	const sw = img.naturalWidth * s;
	const sh = img.naturalHeight * s;
	g.drawImage(img, (dw - sw) / 2, (dh - sh) / 2, sw, sh);
	const im = g.getImageData(0, 0, dw, dh);
	const p = im.data;
	const [ir, ig, ib] = hexRgb(INK);
	const [gr, gg, gb] = hexRgb(GROUND);
	for (let i = 0; i < p.length; i += 4) {
		const lum = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255;
		// lift + expand tonal range so even a dark, low-contrast hero stays legible
		const t = 0.16 + Math.min(1, Math.pow(lum, 0.8) * 1.25) * 0.84;
		p[i] = gr + (ir - gr) * t;
		p[i + 1] = gg + (ig - gg) * t;
		p[i + 2] = gb + (ib - gb) * t;
		p[i + 3] = 255;
	}
	g.putImageData(im, 0, 0);
	return c;
}

function grain(alpha: number): HTMLCanvasElement {
	const s = 160;
	const c = document.createElement('canvas');
	c.width = c.height = s;
	const g = c.getContext('2d')!;
	const im = g.createImageData(s, s);
	for (let i = 0; i < im.data.length; i += 4) {
		const v = Math.random();
		im.data[i] = im.data[i + 1] = im.data[i + 2] = v > 0.5 ? 255 : 0;
		im.data[i + 3] = (v > 0.985 ? 26 : v < 0.02 ? 40 : 7) * alpha;
	}
	g.putImageData(im, 0, 0);
	return c;
}

/** tint a mostly-black-on-transparent mark to `color`, cover-fit into (dw,dh). */
function tintMark(img: HTMLImageElement, dw: number, dh: number, color: string): HTMLCanvasElement {
	const c = document.createElement('canvas');
	c.width = dw;
	c.height = dh;
	const g = c.getContext('2d')!;
	const s = Math.min(dw / img.naturalWidth, dh / img.naturalHeight);
	const w = img.naturalWidth * s;
	const h = img.naturalHeight * s;
	g.drawImage(img, (dw - w) / 2, (dh - h) / 2, w, h);
	g.globalCompositeOperation = 'source-in';
	g.fillStyle = color;
	g.fillRect(0, 0, dw, dh);
	return c;
}

/** A bone panel + dark QR in the lower-right, with a "scan to read" label.
 *  Instagram gives web-shared stories no tappable link, so the QR (plus the
 *  URL printed in the footer) is how a viewer reaches the article. */
function drawQr(ctx: CanvasRenderingContext2D, url: string) {
	const qr = qrcode(0, 'M');
	qr.addData(url);
	qr.make();
	const n = qr.getModuleCount();

	const panel = 196;
	const quiet = 16;
	const cell = (panel - quiet * 2) / n;
	const x0 = W - EDGE - panel;
	const y0 = 1520;

	ctx.save();
	ctx.fillStyle = INK;
	ctx.fillRect(x0, y0, panel, panel);
	ctx.fillStyle = '#14110c';
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) {
			if (qr.isDark(r, c)) {
				ctx.fillRect(
					Math.floor(x0 + quiet + c * cell),
					Math.floor(y0 + quiet + r * cell),
					Math.ceil(cell),
					Math.ceil(cell),
				);
			}
		}
	}
	ctx.restore();

	ctx.save();
	ctx.font = FONT.mono(19);
	ctx.fillStyle = YELLOW;
	ctx.textAlign = 'right';
	(ctx as any).letterSpacing = '3px';
	ctx.fillText('SCAN TO READ', x0 + panel, y0 - 22);
	(ctx as any).letterSpacing = '0px';
	ctx.restore();
}

export async function renderStoryCard(d: StoryCardData): Promise<Blob> {
	await fontsReady();
	resolveFamilies();

	const [hero, roach] = await Promise.all([loadImage(d.heroUrl), loadImage(d.roachUrl)]);

	const canvas = document.createElement('canvas');
	canvas.width = W;
	canvas.height = H;
	const ctx = canvas.getContext('2d')!;
	const rng = makeRng(seedFrom(`${d.issueNo}-${d.title}`));

	ctx.fillStyle = GROUND;
	ctx.fillRect(0, 0, W, H);

	// ── loose scatter of hand marks, kept to the margins ──────────────────────
	for (let i = 0; i < 10; i++) {
		const gx = rng.chance(0.5) ? rng.range(18, EDGE - 26) : rng.range(W - EDGE + 26, W - 18);
		const gy = rng.range(H * 0.06, H * 0.94);
		if (rng() < 0.45) {
			strokePath(
				ctx,
				line({ x: gx, y: gy }, { x: gx + rng.range(-32, 32), y: gy + rng.range(-60, 60) }, rng),
				1,
				{ color: rng.chance(0.5) ? YELLOW : DIM, width: 2, alpha: 0.6 },
			);
		} else {
			const e = ellipse(gx, gy, rng.range(12, 22), rng.range(9, 18), rng);
			strokePath(ctx, e, 1, { color: rng.chance(0.4) ? BLUE : DIM, width: 1.8, alpha: 0.5 });
		}
	}

	// ── header: roach mark + wordmark, then the issue/kicker line ─────────────
	let y = 258;
	if (roach) {
		const rh = 118;
		const rw = (roach.naturalWidth / roach.naturalHeight) * rh;
		ctx.drawImage(tintMark(roach, Math.ceil(rw), rh, INK), EDGE, y - rh + 22);
		ctx.save();
		ctx.font = FONT.display(40);
		ctx.fillStyle = INK;
		ctx.textBaseline = 'alphabetic';
		(ctx as any).letterSpacing = '2px';
		ctx.fillText('ROACHWORLD', EDGE + rw + 26, y);
		(ctx as any).letterSpacing = '0px';
		ctx.restore();
	} else {
		ctx.save();
		ctx.font = FONT.display(40);
		ctx.fillStyle = INK;
		(ctx as any).letterSpacing = '2px';
		ctx.fillText('ROACHWORLD', EDGE, y);
		(ctx as any).letterSpacing = '0px';
		ctx.restore();
	}

	y += 54;
	ctx.save();
	ctx.font = FONT.mono(22);
	ctx.fillStyle = BLUE;
	(ctx as any).letterSpacing = '4px';
	ctx.fillText(
		`ISSUE NO. ${String(d.issueNo).padStart(2, '0')} · ${d.kicker.toUpperCase()}`,
		EDGE,
		y,
	);
	(ctx as any).letterSpacing = '0px';
	ctx.restore();

	const headerBottom = y + 12;

	// ── measure the title + quote so the block can be bottom-anchored ─────────
	const quote = clampQuote(d.quote);
	const hasQuote = !!quote;

	const titleText = d.title.toUpperCase();
	const px = fitInk(titleText, FONT.display, COL, hero ? 3 : 4, [56, hero ? 120 : 150], 0.98);
	const lh = px * 0.98;
	const tb = layoutInk(titleText, FONT.display(px), COL, lh, EDGE, 0);
	const nLines = tb.lines.length;

	const qpx = 46;
	const qb = hasQuote
		? layoutInk(`“${quote}”`, FONT.hand(qpx), Math.min(COL, 760), qpx * 1.05, EDGE, 0)
		: null;

	// Lay the title→quote→byline block out relative to the byline baseline, then
	// choose that baseline: bottom-anchored when a hero fills the space above,
	// vertically centred otherwise.
	const layout = (baseline: number) => {
		const quoteTop = qb ? baseline - 96 - qb.height : 0;
		const underY = qb ? quoteTop - 58 : baseline - 96;
		const titleLastBaseline = underY - px * 0.34;
		const titleY = titleLastBaseline - (nLines - 1) * lh - px * 0.8;
		return { quoteTop, underY, titleLastBaseline, titleY, capTop: titleY + px * 0.12 };
	};
	const bylineBaseline = hero ? 1548 : 1176;
	const { quoteTop, underY, titleLastBaseline, titleY, capTop: titleCapTop } =
		layout(bylineBaseline);

	// ── hero (optional) fills the band between the header and the title ───────
	if (hero) {
		const top = headerBottom + 56;
		let fh = Math.round(titleCapTop - 54 - top);
		fh = Math.max(340, Math.min(860, fh));
		const fy = Math.max(top, Math.round(titleCapTop - 54 - fh));
		ctx.drawImage(duotone(hero, COL, fh), EDGE, fy);
		const frame: Pt[] = [
			...line({ x: EDGE, y: fy }, { x: EDGE + COL, y: fy }, rng, 0.7),
			...line({ x: EDGE + COL, y: fy }, { x: EDGE + COL, y: fy + fh }, rng, 0.7),
			...line({ x: EDGE + COL, y: fy + fh }, { x: EDGE, y: fy + fh }, rng, 0.7),
			...line({ x: EDGE, y: fy + fh }, { x: EDGE, y: fy }, rng, 0.7),
		];
		strokePath(ctx, frame, 1, { color: INK, width: 3 });
	} else {
		// no hero — a big translucent issue number stands in for the image
		const numSize = 660;
		const numBaseline = (titleCapTop + titleLastBaseline) / 2 + numSize * 0.36;
		ctx.save();
		ctx.font = FONT.display(numSize);
		ctx.fillStyle = BLUE;
		ctx.globalAlpha = 0.13;
		ctx.textBaseline = 'alphabetic';
		ctx.textAlign = 'center';
		ctx.fillText(String(d.issueNo).padStart(2, '0'), W / 2, numBaseline);
		ctx.restore();
		// a scatter of asterisks in the lower field so the negative space reads
		for (let i = 0; i < 6; i++) {
			asterisk(
				ctx,
				rng.range(EDGE, W - EDGE),
				rng.range(bylineBaseline + 130, 1560),
				rng.range(11, 24),
				rng,
				1,
				rng.chance(0.5) ? BLUE : DIM,
			);
		}
	}

	// ── title, set with pretext ──────────────────────────────────────────────
	drawInk(
		ctx,
		{ ...tb, lines: tb.lines.map((l) => ({ ...l, y: l.y + titleY + px * 0.8 })) },
		1,
		{ font: FONT.display(px), color: INK },
	);
	const lastLine = tb.lines[nLines - 1];
	const underLen = Math.min(COL, Math.max(lastLine.chars * px * 0.6 + 24, COL * 0.44));
	strokePath(ctx, line({ x: EDGE, y: underY }, { x: EDGE + underLen, y: underY }, rng, 0.6), 1, {
		color: YELLOW,
		width: 9,
		alpha: 0.92,
	});

	// ── pull quote (optional) ────────────────────────────────────────────────
	if (qb) {
		drawInk(
			ctx,
			{ ...qb, lines: qb.lines.map((l) => ({ ...l, y: l.y + quoteTop + qpx * 0.85 })) },
			1,
			{ font: FONT.hand(qpx), color: YELLOW },
		);
		const e = ellipse(
			EDGE + qb.width / 2,
			quoteTop + qb.height / 2,
			qb.width / 2 + 44,
			qb.height / 2 + 24,
			rng,
		);
		strokePath(ctx, e, 1, { color: BLUE, width: 3 });
	}

	// ── byline ───────────────────────────────────────────────────────────────
	ctx.save();
	ctx.font = FONT.mono(24);
	ctx.fillStyle = DIM;
	(ctx as any).letterSpacing = '3px';
	ctx.fillText(`BY ${d.byline.toUpperCase()}`, EDGE, bylineBaseline);
	(ctx as any).letterSpacing = '0px';
	ctx.restore();

	// ── footer, anchored above Instagram's send bar ──────────────────────────
	const fy = 1636;
	strokePath(ctx, line({ x: EDGE, y: fy }, { x: W - EDGE - 236, y: fy }, rng, 1), 1, {
		color: BLUE,
		width: 3,
	});
	ctx.save();
	ctx.font = FONT.mono(22);
	ctx.fillStyle = DIM;
	(ctx as any).letterSpacing = '2px';
	ctx.fillText(d.siteLabel.toUpperCase(), EDGE, fy + 44);
	(ctx as any).letterSpacing = '0px';
	ctx.font = FONT.hand(30);
	ctx.fillStyle = YELLOW;
	ctx.fillText('*all words 100% human generated', EDGE, fy + 92);
	ctx.restore();

	// ── grain ────────────────────────────────────────────────────────────────
	const g = ctx.createPattern(grain(1), 'repeat');
	if (g) {
		ctx.save();
		ctx.globalCompositeOperation = 'overlay';
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, W, H);
		ctx.restore();
	}

	// ── QR to the article — how a viewer gets from the story to the piece ─────
	// drawn after the grain so the code stays crisp and scannable
	drawQr(ctx, d.url);

	return new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
	});
}

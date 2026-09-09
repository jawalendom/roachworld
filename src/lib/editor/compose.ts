// Reusable building blocks for an issue's editor view. Machine-drawn: straight
// rules, registration brackets, RGB channel-split, decode-style reveals.

import type { Sheet } from './sheet';
import type { Block } from './parseBody';
import { layoutInk, drawInk, fitInk } from './ink';
import { rule, dataBar, brackets, crosshair, sliceGlitch } from './glitch';

export interface Theme {
	ground: string;
	ink: string;
	dim: string;
	accent: string; // acid green — signals, underlines, prefixes
	accent2: string; // glitch red — alerts, split channel
	display: (px: number) => string;
	body: (px: number) => string;
	mono: (px: number) => string;
	hand: (px: number) => string; // unused in this key; kept for the Theme shape
}

const SPLIT: [string, string] = ['#ff2e4d', '#13e8ff'];

export function contentBox(s: Sheet) {
	const edge = Math.max(20, Math.min(s.W * 0.08, 90));
	const w = Math.min(s.W - edge * 2, 660);
	const x = s.W < 760 ? edge : Math.max(edge, s.W * 0.16);
	return { x, w, edge };
}

const bodyPx = (s: Sheet) => (s.W < 620 ? 17 : 19);

function mono(
	ctx: CanvasRenderingContext2D,
	text: string,
	x: number,
	baseline: number,
	font: string,
	color: string,
	spacing = 2,
	alpha = 1,
) {
	ctx.save();
	ctx.font = font;
	ctx.fillStyle = color;
	ctx.globalAlpha = alpha;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	(ctx as any).letterSpacing = `${spacing}px`;
	ctx.fillText(text, x, baseline);
	(ctx as any).letterSpacing = '0px';
	ctx.restore();
}

// ── cover ──────────────────────────────────────────────────────────────────
export function cover(
	s: Sheet,
	t: Theme,
	d: { no: number; title: string; date: string; blurb: string },
) {
	const { x } = contentBox(s);
	const edge = Math.max(20, Math.min(s.W * 0.08, 90));
	const w = s.W - edge * 2;
	const top = s.cursor + s.vh * 0.12;

	s.push({
		y: top,
		h: 20,
		reveal: 60,
		lead: s.vh * 0.4,
		draw(ctx) {
			mono(ctx, `▶ ISSUE_${String(d.no).padStart(2, '0')}`, x, 14, t.mono(14), t.accent, 4);
		},
	});

	const titleText = d.title.toUpperCase();
	const tw = s.W - x - edge;
	const cap = s.W < 620 ? 92 : 156;
	const linesAt = (px: number) => layoutInk(titleText, t.display(px), tw, px, x, 0).lines.length;
	const largest = (maxLines: number) => {
		let lo = 24;
		let hi = cap;
		for (let i = 0; i < 16; i++) {
			const mid = (lo + hi) / 2;
			if (linesAt(mid) <= maxLines) lo = mid;
			else hi = mid;
		}
		return Math.floor(lo);
	};
	let titlePx = largest(1);
	if (titlePx < 44) titlePx = largest(2);
	const tb = layoutInk(titleText, t.display(titlePx), tw, titlePx * 0.96, x, 0);
	const titleY = top + 14 * 2.4 + titlePx * 0.8;
	s.push({
		y: titleY,
		h: tb.height + titlePx,
		reveal: 1,
		lead: 0,
		draw(ctx) {
			brackets(ctx, x - 26, -titlePx * 0.12, tb.width + 52, tb.height + titlePx * 0.32, 1, {
				color: t.accent,
				width: 2,
				len: 28,
			});
			drawInk(ctx, { ...tb, lines: tb.lines.map((l) => ({ ...l, y: l.y + titlePx * 0.8 })) }, 1, {
				font: t.display(titlePx),
				color: t.ink,
				split: 4,
				splitColors: SPLIT,
			});
		},
	});

	const blurbPx = s.W < 620 ? 13 : 15;
	const bl = layoutInk(d.blurb, t.mono(blurbPx), Math.min(w, 480), blurbPx * 1.7, x, 0);
	const blurbY = titleY + tb.height + titlePx * 0.9;
	s.push({
		y: blurbY,
		h: bl.height + 30,
		reveal: s.vh * 0.5,
		draw(ctx, p) {
			drawInk(ctx, { ...bl, lines: bl.lines.map((l) => ({ ...l, y: l.y + blurbPx })) }, p, {
				font: t.mono(blurbPx),
				color: t.dim,
				letterSpacing: 0.5,
				scramble: true,
			});
		},
	});

	const dateY = blurbY + bl.height + 30;
	s.push({
		y: dateY,
		h: 20,
		reveal: 40,
		draw(ctx) {
			rule(ctx, x, -14, x + 40, -14, 1, { color: t.accent, width: 2 });
			mono(ctx, d.date.toUpperCase().replace(/,/g, '') + '  //  ROACHWORLD', x, 12, t.mono(12), t.dim, 2);
		},
	});

	s.cursor = dateY + s.vh * 0.14;
}

// ── contents page ──────────────────────────────────────────────────────────
export function contents(
	s: Sheet,
	t: Theme,
	items: { order: number; title: string; slug: string }[],
) {
	const { x, edge } = contentBox(s);
	const w = Math.min(s.W - x - edge, 900);

	s.push({
		y: s.cursor,
		h: 18,
		reveal: 40,
		draw(ctx) {
			mono(ctx, '// CONTENTS', x, 12, t.mono(13), t.accent, 3);
		},
	});
	s.cursor += 40;

	s.push({
		y: s.cursor,
		h: 10,
		reveal: 160,
		draw: (ctx, p) => dataBar(ctx, edge, 0, s.W - edge * 2, p * 1.6, { color: t.dim, width: 4, seg: 18, gap: 8 }),
	});
	s.cursor += 30;

	const px = s.W < 620 ? 22 : 30;
	const tx = x + 62;
	for (const it of items) {
		const b = layoutInk(it.title.toUpperCase(), t.display(px), w - 62, px * 1.04, tx, 0);
		const y = s.cursor + 6;
		s.push({
			y,
			h: b.height + 20,
			reveal: s.vh * 0.3,
			draw(ctx, p) {
				mono(ctx, `[${String(it.order).padStart(2, '0')}]`, x, px * 0.78, t.mono(13), t.accent, 1);
				drawInk(ctx, { ...b, lines: b.lines.map((l) => ({ ...l, y: l.y + px * 0.82 })) }, p, {
					font: t.display(px),
					color: t.ink,
					split: 3,
					splitColors: SPLIT,
					scramble: true,
				});
				const uw = Math.min(w - 62, b.width + 10);
				rule(ctx, tx, b.height + 4, tx + uw, b.height + 4, Math.max(0, (p - 0.5) * 2.4), {
					color: t.accent,
					width: 2.5,
				});
			},
		});
		s.hotspot({ x, y: y - 8, w: Math.min(w, tx - x + b.width + 16), h: b.height + 24 }, it.slug);
		s.cursor = y + b.height + 15;
	}
	s.cursor += s.vh * 0.12;
}

// ── article divider ────────────────────────────────────────────────────────
export function divider(s: Sheet, t: Theme, d: { order: number; kicker: string }) {
	const { x, edge } = contentBox(s);
	const y = s.cursor + 44;
	const numPx = s.W < 620 ? 58 : 84;
	const no = String(d.order).padStart(2, '0');

	s.push({
		y,
		h: numPx + 34,
		reveal: s.vh * 0.4,
		lead: s.vh * 0.22,
		draw(ctx, p) {
			rule(ctx, edge, 0, s.W - edge, 0, Math.min(1, p * 1.6), { color: t.ink, width: 3 });
			dataBar(ctx, edge, 8, (s.W - edge * 2) * 0.4, Math.max(0, (p - 0.2) * 1.5), {
				color: t.accent,
				width: 4,
				seg: 12,
				gap: 6,
			});
			const nb = layoutInk(`[ ${no} ]`, t.display(numPx), 400, numPx, x, 0);
			drawInk(ctx, { ...nb, lines: nb.lines.map((l) => ({ ...l, y: numPx * 0.9 + 24 })) }, Math.min(1, p * 1.6), {
				font: t.display(numPx),
				color: t.ink,
				split: 5,
				splitColors: SPLIT,
			});
			mono(ctx, `// ${d.kicker.toUpperCase()}`, x + numPx * 3.0, numPx * 0.5 + 24, t.mono(12), t.accent, 3);
		},
	});
	s.cursor = y + numPx + 24;
}

export function headline(s: Sheet, t: Theme, text: string) {
	const { x, edge } = contentBox(s);
	const w = Math.min(s.W - x - edge, 980);
	const head = text.toUpperCase();
	const px = fitInk(head, t.display, w, 3, [44, 104], 1.0);
	const b = layoutInk(head, t.display(px), w, px, x, 0);
	const y = s.cursor + 26;
	s.push({
		y,
		h: b.height + px,
		reveal: s.vh * 0.45,
		draw(ctx, p) {
			rule(ctx, x - 18, 4, x - 18, b.height, Math.min(1, p * 2), { color: t.accent, width: 3 });
			drawInk(ctx, { ...b, lines: b.lines.map((l) => ({ ...l, y: l.y + px * 0.82 })) }, p, {
				font: t.display(px),
				color: t.ink,
				split: 5,
				splitColors: SPLIT,
				jitter: 4,
				scramble: true,
			});
		},
	});
	s.cursor = y + b.height + px * 0.12;
}

export function dek(s: Sheet, t: Theme, text: string) {
	const { x, w } = contentBox(s);
	const px = s.W < 620 ? 13 : 15;
	const b = layoutInk(text.toUpperCase(), t.mono(px), Math.min(w, 520), px * 1.75, x, 0);
	const y = s.cursor;
	s.push({
		y,
		h: b.height + 20,
		reveal: s.vh * 0.45,
		draw(ctx, p) {
			mono(ctx, '>', x - 20, px, t.mono(px), t.accent, 0);
			drawInk(ctx, { ...b, lines: b.lines.map((l) => ({ ...l, y: l.y + px })) }, p, {
				font: t.mono(px),
				color: t.dim,
				letterSpacing: 1,
				scramble: true,
			});
		},
	});
	s.cursor = y + b.height + 14;
}

/** Placeholder for an article that hasn't been written yet. */
export function fillerNote(s: Sheet, t: Theme) {
	const { x, w } = contentBox(s);
	const px = s.W < 620 ? 16 : 20;
	const y = s.cursor + 10;
	s.push({
		y,
		h: 56,
		reveal: s.vh * 0.35,
		draw(ctx, p) {
			mono(ctx, '> [ AWAITING INPUT ]  █', x, px, t.mono(px), t.accent2, 2);
			rule(ctx, x, 34, x + Math.min(w, 280), 34, Math.max(0, (p - 0.3) * 1.8), {
				color: t.accent2,
				width: 1.5,
				alpha: 0.6,
			});
		},
	});
	s.cursor = y + 62;
}

export function byline(s: Sheet, t: Theme, text: string) {
	const { x } = contentBox(s);
	const y = s.cursor;
	s.push({
		y,
		h: 24,
		reveal: 50,
		draw(ctx) {
			mono(ctx, `// ${text.toUpperCase()}`, x, 11, t.mono(11), t.dim, 2);
		},
	});
	s.cursor = y + 40;
}

// ── body ───────────────────────────────────────────────────────────────────
export function body(s: Sheet, t: Theme, blocks: Block[]) {
	const { x, w } = contentBox(s);
	const px = bodyPx(s);
	const lh = px * 1.62;

	for (const block of blocks) {
		if (block.type === 'rule') {
			const y = s.cursor + lh * 0.4;
			s.push({
				y,
				h: lh,
				reveal: 120,
				draw: (ctx, p) => dataBar(ctx, x, 0, Math.min(w, 160), p, { color: t.accent, width: 4, seg: 10, gap: 5 }),
			});
			s.cursor = y + lh;
			continue;
		}
		if (block.type === 'heading') {
			const hpx = px * 1.3;
			const b = layoutInk(block.text.toUpperCase(), t.display(hpx), w, hpx * 1.1, x, 0);
			const y = s.cursor + lh;
			s.push({
				y,
				h: b.height + 28,
				reveal: s.vh * 0.4,
				draw(ctx, p) {
					drawInk(ctx, { ...b, lines: b.lines.map((l) => ({ ...l, y: l.y + hpx * 0.82 })) }, p, {
						font: t.display(hpx),
						color: t.ink,
						split: 4,
						splitColors: SPLIT,
					});
					rule(ctx, x, b.height + 8, x + Math.min(w, b.width + 8), b.height + 8, Math.max(0, (p - 0.6) * 2.5), {
						color: t.accent,
						width: 4,
					});
				},
			});
			s.cursor = y + b.height + 22;
			continue;
		}
		if (block.type === 'pull') {
			const qpx = s.W < 620 ? 24 : 30;
			const b = layoutInk(block.text.toUpperCase(), t.display(qpx), Math.min(w, 560), qpx * 1.15, x + 24, 0);
			const y = s.cursor + lh * 0.6;
			s.push({
				y,
				h: b.height + qpx * 2,
				reveal: s.vh * 0.6,
				draw(ctx, p) {
					rule(ctx, x, 0, x, b.height + 6, Math.min(1, p * 2), { color: t.accent2, width: 4 });
					drawInk(ctx, { ...b, lines: b.lines.map((l) => ({ ...l, y: l.y + qpx * 0.9 })) }, p, {
						font: t.display(qpx),
						color: t.accent,
						split: 3,
						splitColors: SPLIT,
						scramble: true,
					});
					if (block.cite) mono(ctx, `— ${block.cite.toUpperCase()}`, x + 24, b.height + qpx * 1.5, t.mono(11), t.dim, 1);
				},
			});
			s.cursor = y + b.height + qpx * 1.1;
			continue;
		}
		if (block.type === 'list') {
			for (const item of block.items) {
				const b = layoutInk(item, t.body(px), w - 26, lh, x + 26, 0);
				const y = s.cursor + lh * 0.22;
				s.push({
					y,
					h: b.height + lh * 0.4,
					reveal: s.vh * 0.35,
					draw(ctx, p) {
						mono(ctx, '▸', x, px * 0.95, t.mono(px), t.accent, 0, Math.min(1, p * 3));
						drawInk(ctx, { ...b, lines: b.lines.map((l) => ({ ...l, y: l.y + px * 0.85 })) }, p, {
							font: t.body(px),
							color: t.ink,
						});
					},
				});
				s.cursor = y + b.height + lh * 0.18;
			}
			s.cursor += lh * 0.4;
			continue;
		}
		// paragraph
		const b = layoutInk(block.text, t.body(px), w, lh, x, 0);
		const y = s.cursor + lh * 0.25;
		s.push({
			y,
			h: b.height + lh * 0.55,
			reveal: Math.max(s.vh * 0.36, b.height * 0.8),
			draw(ctx, p) {
				drawInk(ctx, { ...b, lines: b.lines.map((l) => ({ ...l, y: l.y + px * 0.85 })) }, p, {
					font: t.body(px),
					color: t.ink,
					split: 1.2,
					splitColors: SPLIT,
				});
			},
		});
		s.cursor = y + b.height + lh * 0.25;
	}
}

// ── figure ─────────────────────────────────────────────────────────────────
export function figure(s: Sheet, t: Theme, d: { url: string; caption?: string }) {
	const { x, w } = contentBox(s);
	const fw = Math.min(w, s.W < 620 ? w : 460);
	const fh = Math.round(fw * 0.62);
	const y = s.cursor + 44;

	const img = new Image();
	img.crossOrigin = 'anonymous';
	img.src = d.url;
	let duo: HTMLCanvasElement | null = null;
	const bake = () => {
		if (!img.naturalWidth) return;
		const c = document.createElement('canvas');
		c.width = fw;
		c.height = fh;
		const g = c.getContext('2d')!;
		g.drawImage(img, 0, 0, fw, fh);
		const im = g.getImageData(0, 0, fw, fh);
		const p = im.data;
		const [ir, ig, ib] = hexRgb(t.ink);
		for (let i = 0; i < p.length; i += 4) {
			const lum = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]) / 255;
			const q = lum > 0.5 ? 1 : lum > 0.28 ? 0.5 : 0; // posterised — 3 levels
			p[i] = ir;
			p[i + 1] = ig;
			p[i + 2] = ib;
			p[i + 3] = q * 235;
		}
		g.putImageData(im, 0, 0);
		duo = c;
	};
	img.addEventListener('load', bake, { once: true });

	s.push({
		y,
		h: fh + 48,
		reveal: s.vh * 0.55,
		draw(ctx, p) {
			if (duo) {
				const clipW = fw * Math.min(1, p * 1.2);
				ctx.save();
				ctx.beginPath();
				ctx.rect(x, 0, clipW, fh);
				ctx.clip();
				const so = 6 * (1 - Math.min(1, p));
				ctx.globalCompositeOperation = 'lighter';
				ctx.globalAlpha = 0.5;
				ctx.drawImage(duo, x - so - 3, 0);
				ctx.drawImage(duo, x + so + 3, 0);
				ctx.globalCompositeOperation = 'source-over';
				ctx.globalAlpha = Math.min(1, p * 1.4);
				ctx.drawImage(duo, x, 0);
				if (p < 1) sliceGlitch(ctx, duo, x, 0, fw, fh, s.rng, (1 - p) * 0.9);
				ctx.restore();
			}
			brackets(ctx, x - 6, -6, fw + 12, fh + 12, Math.min(1, p * 1.4), { color: t.accent, width: 2, len: 24 });
			crosshair(ctx, x + fw, fh, 10, Math.min(1, p * 1.4), { color: t.accent2, width: 1.5 });
			if (d.caption) mono(ctx, `// ${d.caption.toUpperCase()}`, x, fh + 26, t.mono(11), t.dim, 1);
		},
	});
	s.cursor = y + fh + 38;
}

export function marginNote(s: Sheet, t: Theme, text: string) {
	const { x, w } = contentBox(s);
	const px = 13;
	const nx = x + w + 30;
	const b = layoutInk(text.toUpperCase(), t.mono(px), 210, px * 1.7, nx, 0);
	const y = s.cursor - s.vh * 0.15;
	s.push({
		y,
		h: b.height + 20,
		reveal: s.vh * 0.4,
		draw(ctx, p) {
			if (nx + 230 > s.W) return;
			rule(ctx, nx - 16, 0, nx - 16, b.height, Math.min(1, p * 2), { color: t.accent, width: 2 });
			drawInk(ctx, { ...b, lines: b.lines.map((l) => ({ ...l, y: l.y + px })) }, p, {
				font: t.mono(px),
				color: t.accent,
				letterSpacing: 0.5,
				scramble: true,
			});
		},
	});
}

function hexRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

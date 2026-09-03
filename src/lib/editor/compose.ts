// Reusable building blocks for an issue's editor view. Each bespoke issue file
// picks a Theme, then arranges these (and its own marks) down the sheet.

import type { Sheet } from './sheet';
import type { Block } from './parseBody';
import { layoutInk, drawInk, fitInk } from './ink';
import { line, ellipse, strokePath, type Pt } from './hand';

export interface Theme {
	ground: string;
	ink: string;
	dim: string;
	accent: string;
	accent2: string;
	display: (px: number) => string;
	body: (px: number) => string;
	mono: (px: number) => string;
	hand: (px: number) => string;
}

export function contentBox(s: Sheet) {
	const edge = Math.max(20, Math.min(s.W * 0.08, 90));
	const w = Math.min(s.W - edge * 2, 660);
	const x = s.W < 760 ? edge : Math.max(edge, s.W * 0.16);
	return { x, w, edge };
}

const bodyPx = (s: Sheet) => (s.W < 620 ? 17 : 19);

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

	const noPx = 14;
	s.push({
		y: top,
		h: noPx * 1.4,
		reveal: 60,
		lead: s.vh * 0.4,
		draw(ctx) {
			ctx.save();
			ctx.font = t.mono(noPx);
			ctx.fillStyle = t.accent2;
			(ctx as any).letterSpacing = '3px';
			ctx.fillText(`ISSUE No. ${String(d.no).padStart(2, '0')}`, x, noPx);
			(ctx as any).letterSpacing = '0px';
			ctx.restore();
		},
	});

	const titleText = d.title.toUpperCase();
	// Keep the title inside the same column as the kicker/date (so a long single
	// word like "FLUORESCENCE" is scaled to the column, never run off-screen).
	// Prefer one line; only if that would be too small do we let it wrap to two.
	const tw = s.W - x - edge;
	const cap = s.W < 620 ? 92 : 156;
	// use the render path itself to size: largest px that stays on one line;
	// only if that would be too small do we let the title wrap to two lines.
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
	const titleY = top + noPx * 2.4 + titlePx * 0.8;
	s.push({
		y: titleY,
		h: tb.height + titlePx,
		reveal: 1,
		lead: 0,
		// the issue title is the cover — it's simply there on load, never drawn on
		draw(ctx) {
			drawInk(ctx, { ...tb, lines: tb.lines.map((l) => ({ ...l, y: l.y + titlePx * 0.8 })) }, 1, {
				font: t.display(titlePx),
				color: t.ink,
			});
		},
	});

	const blurbY = titleY + tb.height + titlePx * 1.1;
	const bl = layoutInk(d.blurb, t.hand(Math.round(titlePx * 0.24)), Math.min(w, 440), Math.round(titlePx * 0.28), x, 0);
	s.push({
		y: blurbY,
		h: bl.height + 30,
		reveal: s.vh * 0.5,
		draw(ctx, p) {
			drawInk(ctx, bl, p, { font: t.hand(Math.round(titlePx * 0.24)), color: t.accent });
		},
	});

	const dateY = blurbY + bl.height + 24;
	s.push({
		y: dateY,
		h: 20,
		reveal: 40,
		draw(ctx) {
			ctx.save();
			ctx.font = t.mono(12);
			ctx.fillStyle = t.dim;
			(ctx as any).letterSpacing = '2px';
			ctx.fillText(d.date.toUpperCase(), x, 12);
			(ctx as any).letterSpacing = '0px';
			ctx.restore();
		},
	});

	s.cursor = dateY + s.vh * 0.14;
}

// ── contents page ──────────────────────────────────────────────────────────
// The zine's own table of contents, hand-set into the sheet just after the
// cover. (The corner Index gives the same jumps as a quick overlay.)
export function contents(
	s: Sheet,
	t: Theme,
	items: { order: number; title: string }[],
) {
	const { x, edge } = contentBox(s);
	const w = Math.min(s.W - x - edge, 900);

	s.push({
		y: s.cursor,
		h: 18,
		reveal: 40,
		draw(ctx) {
			ctx.save();
			ctx.font = t.mono(12);
			ctx.fillStyle = t.accent2;
			(ctx as any).letterSpacing = '3px';
			ctx.fillText('CONTENTS', x, 12);
			(ctx as any).letterSpacing = '0px';
			ctx.restore();
		},
	});
	s.cursor += 40;

	const rule = line({ x: edge, y: 0 }, { x: s.W - edge, y: 0 }, s.rng, 1);
	s.push({
		y: s.cursor,
		h: 8,
		reveal: 160,
		draw: (ctx, p) => strokePath(ctx, rule, Math.min(1, p * 1.6), { color: t.ink, width: 2.5 }),
	});
	s.cursor += 28;

	const px = s.W < 620 ? 22 : 30;
	const tx = x + 58;
	for (const it of items) {
		const b = layoutInk(it.title.toUpperCase(), t.display(px), w - 58, px * 1.04, tx, 0);
		const y = s.cursor + 6;
		const under = line(
			{ x: tx, y: b.height + 3 },
			{ x: tx + Math.min(w - 58, b.width + 10), y: b.height + 3 },
			s.rng,
			0.6,
		);
		s.push({
			y,
			h: b.height + 20,
			reveal: s.vh * 0.3,
			draw(ctx, p) {
				ctx.save();
				ctx.font = t.mono(13);
				ctx.fillStyle = t.accent2;
				ctx.fillText(String(it.order).padStart(2, '0'), x, px * 0.82);
				ctx.restore();
				drawInk(ctx, { ...b, lines: b.lines.map((l) => ({ ...l, y: l.y + px * 0.82 })) }, p, {
					font: t.display(px),
					color: t.ink,
				});
				strokePath(ctx, under, Math.max(0, (p - 0.5) * 2.4), { color: t.accent, width: 3 });
			},
		});
		s.cursor = y + b.height + 15;
	}
	s.cursor += s.vh * 0.12;
}

// ── article divider ────────────────────────────────────────────────────────
export function divider(s: Sheet, t: Theme, d: { order: number; kicker: string }) {
	const { x, edge } = contentBox(s);
	const y = s.cursor + 44;
	const rule = line({ x: edge, y: 0 }, { x: s.W - edge, y: 0 }, s.rng, 1.1);
	const numPx = s.W < 620 ? 58 : 84;
	const no = String(d.order).padStart(2, '0');
	const ell = ellipse(x + numPx * 0.55, numPx * 0.5 + 24, numPx * 0.9, numPx * 0.62, s.rng);

	s.push({
		y,
		h: numPx + 34,
		reveal: s.vh * 0.4,
		lead: s.vh * 0.22,
		draw(ctx, p) {
			strokePath(ctx, rule, Math.min(1, p * 1.6), { color: t.ink, width: 3.5 });
			ctx.save();
			ctx.font = t.display(numPx);
			ctx.fillStyle = t.accent2;
			ctx.textBaseline = 'alphabetic';
			ctx.fillText(no.slice(0, Math.max(0, Math.floor(p * 2.2))), x, numPx * 0.9 + 24);
			ctx.restore();
			if (p > 0.45) strokePath(ctx, ell, (p - 0.45) * 2, { color: t.accent, width: 2.4 });
			ctx.save();
			ctx.font = t.mono(12);
			ctx.fillStyle = t.dim;
			(ctx as any).letterSpacing = '3px';
			ctx.fillText(d.kicker.toUpperCase(), x + numPx * 2.5, numPx * 0.5 + 24);
			(ctx as any).letterSpacing = '0px';
			ctx.restore();
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
			drawInk(ctx, { ...b, lines: b.lines.map((l) => ({ ...l, y: l.y + px * 0.82 })) }, p, {
				font: t.display(px),
				color: t.ink,
			});
		},
	});
	s.cursor = y + b.height + px * 0.12;
}

export function dek(s: Sheet, t: Theme, text: string) {
	const { x, w } = contentBox(s);
	const px = s.W < 620 ? 20 : 24;
	const b = layoutInk(text, t.hand(px), Math.min(w, 520), px * 1.1, x, 0);
	const y = s.cursor;
	s.push({
		y,
		h: b.height + 20,
		reveal: s.vh * 0.45,
		draw(ctx, p) {
			drawInk(ctx, { ...b, lines: b.lines.map((l) => ({ ...l, y: l.y + px * 0.85 })) }, p, {
				font: t.hand(px),
				color: t.dim,
			});
		},
	});
	s.cursor = y + b.height + 12;
}

export function byline(s: Sheet, t: Theme, text: string) {
	const { x } = contentBox(s);
	const y = s.cursor;
	s.push({
		y,
		h: 24,
		reveal: 50,
		draw(ctx) {
			ctx.save();
			ctx.font = t.mono(11);
			ctx.fillStyle = t.dim;
			(ctx as any).letterSpacing = '2px';
			ctx.fillText(text.toUpperCase(), x, 11);
			(ctx as any).letterSpacing = '0px';
			ctx.restore();
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
			const r = line({ x, y: 0 }, { x: x + Math.min(w, 120), y: 0 }, s.rng, 0.7);
			s.push({ y, h: lh, reveal: 120, draw: (ctx, p) => strokePath(ctx, r, p, { color: t.accent2, width: 2 }) });
			s.cursor = y + lh;
			continue;
		}
		if (block.type === 'heading') {
			const hpx = px * 1.3;
			const b = layoutInk(block.text.toUpperCase(), t.display(hpx), w, hpx * 1.1, x, 0);
			const y = s.cursor + lh;
			const under = line({ x, y: b.height + 6 }, { x: x + Math.min(w, b.width + 8), y: b.height + 6 }, s.rng, 0.6);
			s.push({
				y,
				h: b.height + 28,
				reveal: s.vh * 0.4,
				draw(ctx, p) {
					drawInk(ctx, { ...b, lines: b.lines.map((l) => ({ ...l, y: l.y + hpx * 0.82 })) }, p, {
						font: t.display(hpx),
						color: t.ink,
					});
					strokePath(ctx, under, Math.max(0, (p - 0.6) * 2.5), { color: t.accent, width: 6, alpha: 0.9 });
				},
			});
			s.cursor = y + b.height + 22;
			continue;
		}
		if (block.type === 'pull') {
			const qpx = s.W < 620 ? 26 : 34;
			const b = layoutInk(block.text, t.hand(qpx), Math.min(w, 540), qpx * 0.98, x, 0);
			const y = s.cursor + lh * 0.5;
			const ell = ellipse(x + b.width / 2, b.height / 2, b.width / 2 + qpx * 0.9, b.height / 2 + qpx * 0.7, s.rng);
			s.push({
				y,
				h: b.height + qpx * 2,
				reveal: s.vh * 0.6,
				draw(ctx, p) {
					drawInk(ctx, { ...b, lines: b.lines.map((l) => ({ ...l, y: l.y + qpx * 0.85 })) }, p, {
						font: t.hand(qpx),
						color: t.accent,
					});
					strokePath(ctx, ell, Math.max(0, (p - 0.35) * 1.6), { color: t.accent2, width: 2.6 });
					if (block.cite) {
						ctx.save();
						ctx.font = t.mono(11);
						ctx.fillStyle = t.dim;
						ctx.fillText(`— ${block.cite}`, x, b.height + qpx * 1.4);
						ctx.restore();
					}
				},
			});
			s.cursor = y + b.height + qpx * 1.0;
			continue;
		}
		if (block.type === 'list') {
			for (const item of block.items) {
				const b = layoutInk(item, t.body(px), w - 22, lh, x + 22, 0);
				const y = s.cursor + lh * 0.22;
				const tick = line({ x: x, y: px * 0.6 }, { x: x + 12, y: px * 0.6 }, s.rng, 0.5);
				s.push({
					y,
					h: b.height + lh * 0.4,
					reveal: s.vh * 0.35,
					draw(ctx, p) {
						strokePath(ctx, tick, Math.min(1, p * 3), { color: t.accent, width: 2.5 });
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
	const y = s.cursor + 40;

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
			const a = Math.min(1, Math.max(0, (lum - 0.15) * 1.25));
			p[i] = ir;
			p[i + 1] = ig;
			p[i + 2] = ib;
			p[i + 3] = a * 235;
		}
		g.putImageData(im, 0, 0);
		duo = c;
	};
	img.addEventListener('load', bake, { once: true });

	const frame: Pt[] = [
		...line({ x, y: 0 }, { x: x + fw, y: 0 }, s.rng, 0.8),
		...line({ x: x + fw, y: 0 }, { x: x + fw, y: fh }, s.rng, 0.8),
		...line({ x: x + fw, y: fh }, { x, y: fh }, s.rng, 0.8),
		...line({ x, y: fh }, { x, y: 0 }, s.rng, 0.8),
	];

	s.push({
		y,
		h: fh + 40,
		reveal: s.vh * 0.55,
		draw(ctx, p) {
			if (duo) {
				ctx.save();
				ctx.globalAlpha = Math.min(1, p * 1.4);
				ctx.beginPath();
				ctx.rect(x, 0, fw * Math.min(1, p * 1.2), fh);
				ctx.clip();
				ctx.drawImage(duo, x, 0);
				ctx.restore();
			}
			strokePath(ctx, frame, Math.min(1, p * 1.3), { color: t.ink, width: 2 });
			if (d.caption) {
				ctx.save();
				ctx.font = t.mono(11);
				ctx.fillStyle = t.dim;
				(ctx as any).letterSpacing = '1px';
				ctx.fillText(d.caption, x, fh + 22);
				(ctx as any).letterSpacing = '0px';
				ctx.restore();
			}
		},
	});
	s.cursor = y + fh + 34;
}

export function marginNote(s: Sheet, t: Theme, text: string) {
	const { x, w } = contentBox(s);
	const px = 17;
	const b = layoutInk(text, t.hand(px), 180, px * 1.05, 0, 0);
	const y = s.cursor - s.vh * 0.15;
	const rot = s.rng.range(-0.09, 0.09);
	const nx = x + w + 24;
	s.push({
		y,
		h: 10,
		reveal: s.vh * 0.4,
		draw(ctx, p) {
			if (nx + 190 > s.W) return;
			ctx.save();
			ctx.translate(nx, 0);
			ctx.rotate(rot);
			drawInk(ctx, { ...b, lines: b.lines.map((l) => ({ ...l, y: l.y + px * 0.85 })) }, p, {
				font: t.hand(px),
				color: t.accent2,
			});
			ctx.restore();
		},
	});
}

function hexRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	const n = parseInt(h.length === 3 ? h.replace(/(.)/g, '$1$1') : h, 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

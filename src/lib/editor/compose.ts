// Reusable building blocks for an issue's editor view. Machine-drawn: straight
// rules, registration brackets, RGB channel-split, decode-style reveals.

import type { Sheet } from './sheet';
import type { Block } from './parseBody';
import { layoutInk, drawInk, fitInk } from './ink';
import { rule, dataBar, brackets, crosshair, sliceGlitch, hash } from './glitch';

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

const TITLE_START = 0.25; // s after mount
const TITLE_INTRO = 1.7; // s to fully resolve
const TITLE_GLYPHS = [...'▚▞▙▟▛▜░▒▓█<>=×+#§¤@/\\'];

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
			mono(ctx, `▶ VOL_${d.no}`, x, 14, t.mono(14), t.accent, 4);
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
		draw(ctx, _p, info) {
			// glitch-load: glyphs resolve left→right through tears, flicker and a
			// wide channel split, then settle; afterwards a short burst every few seconds.
			const k = Math.min(1, Math.max(0, (info.t - TITLE_START) / TITLE_INTRO));
			if (k <= 0) return;
			const step = Math.floor(info.t * 24);
			let burst = 0;
			if (k >= 1 && !info.reduce) {
				const cyc = Math.floor(info.t / 3.2);
				const into = info.t - cyc * 3.2;
				if (hash(cyc, 31) < 0.7 && into < 0.3) burst = 1 - into / 0.3;
			}
			const chaos = Math.max(1 - k, burst * 0.55);
			if (chaos > 0.3 && hash(step, 5) < chaos * 0.3) return; // dropped frame

			let idx = 0;
			const lines = tb.lines.map((l) => {
				const chars = [...l.text];
				const text = chars
					.map((ch, i) => {
						const n = idx + i;
						if (ch === ' ') return ch;
						const settle = (n / tb.totalChars) * 0.75 + hash(n, 3) * 0.25;
						const glyph = TITLE_GLYPHS[Math.floor(hash(step, n, 1) * TITLE_GLYPHS.length)];
						if (k < settle) return k < settle - 0.4 && hash(step, n, 2) < 0.5 ? ' ' : glyph;
						if (burst > 0 && hash(step, n, 9) < burst * 0.3) return glyph;
						return ch;
					})
					.join('');
				idx += chars.length;
				return { ...l, text, y: l.y + titlePx * 0.8 };
			});

			const jx = chaos > 0.02 ? (hash(step, 40) - 0.5) * chaos * 16 : 0;
			brackets(ctx, x - 26 + jx, -titlePx * 0.12, tb.width + 52, tb.height + titlePx * 0.32, Math.min(1, k * 1.6), {
				color: chaos > 0.02 && hash(step, 41) < 0.3 ? t.accent2 : t.accent,
				width: 2,
				len: 28,
			});

			const H = tb.height + titlePx * 0.5;
			const y0 = -titlePx * 0.25;
			const bands = chaos > 0.02 ? 8 : 1;
			for (let b = 0; b < bands; b++) {
				ctx.save();
				if (bands > 1) {
					const dx =
						hash(step, b, 4) < 0.5 ? (hash(step, b, 5) - 0.5) * 2 * chaos * titlePx * 0.7 : 0;
					ctx.beginPath();
					ctx.rect(-20, y0 + (b * H) / bands, s.W + 40, H / bands + 1);
					ctx.clip();
					ctx.translate(dx, 0);
				}
				drawInk(ctx, { ...tb, lines }, 1, {
					font: t.display(titlePx),
					color: t.ink,
					split: 4 + chaos * 70,
					splitColors: SPLIT,
				});
				ctx.restore();
			}
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

// ── chat ───────────────────────────────────────────────────────────────────
export interface ChatMsg {
	from: 'me' | 'them';
	text?: string;
	at?: string;
	image?: { url: string; w: number; h: number };
}

const TYPING = 0.6; // share of a reply's reveal spent on the "typing…" bubble
const POP = 0.38; // s — glitch settle once a bubble lands

/** A text-message thread. Each bubble lands as it scrolls into view; replies
 *  from `them` are preceded by a three-dot typing bubble that bounces for as
 *  long as you hover in that stretch of scroll. */
export function chat(
	s: Sheet,
	t: Theme,
	all: ChatMsg[],
	o: { me: string; them: string; limit?: number; moreHref?: string },
) {
	const names = o;
	const cut = !!o.limit && o.limit < all.length;
	const msgs = cut ? all.slice(0, o.limit) : all;
	const { x, w } = contentBox(s);
	const px = s.W < 620 ? 16 : 17;
	const lh = px * 1.4;
	const padX = 15;
	const padY = 10;
	const maxW = Math.min(w * 0.8, 440);
	const CYAN = SPLIT[1];
	const r = 18;

	s.cursor += 30;
	let prev: ChatMsg['from'] | null = null;

	msgs.forEach((m, i) => {
		const mine = m.from === 'me';
		const last = !cut && i === msgs.length - 1;

		if (m.at) {
			const label = m.at.toUpperCase().replace(/,/g, '').replace(' AT ', '  //  ');
			const y = s.cursor + 18;
			s.push({
				y,
				h: 20,
				reveal: 60,
				draw(ctx) {
					ctx.save();
					ctx.font = t.mono(11);
					(ctx as any).letterSpacing = '2px';
					const tw = ctx.measureText(label).width;
					(ctx as any).letterSpacing = '0px';
					ctx.restore();
					mono(ctx, label, x + (w - tw) / 2, 11, t.mono(11), t.dim, 2);
				},
			});
			s.cursor = y + 30;
			prev = null;
		}

		// sender tag whenever the speaker changes
		if (prev !== m.from) {
			const tag = (mine ? names.me : names.them).toUpperCase();
			const y = s.cursor + (prev ? 18 : 4);
			s.push({
				y,
				h: 14,
				reveal: 40,
				draw(ctx) {
					ctx.save();
					ctx.font = t.mono(10);
					(ctx as any).letterSpacing = '3px';
					const tw = ctx.measureText(tag).width;
					(ctx as any).letterSpacing = '0px';
					ctx.restore();
					const tx = mine ? x + w - tw - 4 : x + 4;
					mono(ctx, mine ? `${tag} <` : `> ${tag}`, mine ? tx - 22 : tx, 10, t.mono(10), mine ? t.accent : CYAN, 3);
				},
			});
			s.cursor = y + 18;
		}
		prev = m.from;

		// measure the bubble
		let bw: number;
		let bh: number;
		let paras: ReturnType<typeof layoutInk>[] = [];
		if (m.image) {
			bw = Math.min(maxW, s.W < 620 ? 230 : 280);
			bh = Math.round((bw * m.image.h) / m.image.w);
		} else {
			paras = (m.text ?? '').split(/\n\s*\n/).map((para) => layoutInk(para.trim(), t.body(px), maxW - padX * 2, lh, 0, 0));
			const inner = Math.max(...paras.map((b) => b.width));
			const textH = paras.reduce((h, b) => h + b.height, 0) + (paras.length - 1) * lh * 0.55;
			bw = Math.ceil(inner + padX * 2);
			bh = Math.ceil(textH + padY * 2);
		}
		const bx = mine ? x + w - bw : x;
		const y = s.cursor;

		let img: HTMLImageElement | null = null;
		if (m.image) {
			img = new Image();
			img.src = m.image.url;
		}

		const fill = mine ? t.accent : '#0d1013';
		const ink = mine ? t.ground : t.ink;
		let poppedAt = -1;

		const bubblePath = (ctx: CanvasRenderingContext2D, ox: number, oy: number) => {
			ctx.beginPath();
			const radii = mine ? [r, r, 5, r] : [r, r, r, 5];
			(ctx as any).roundRect(bx + ox, oy, bw, bh, radii);
		};

		const paint = (ctx: CanvasRenderingContext2D, ox: number, oy: number) => {
			if (img) {
				ctx.save();
				bubblePath(ctx, ox, oy);
				ctx.clip();
				if (img.complete && img.naturalWidth) ctx.drawImage(img, bx + ox, oy, bw, bh);
				else {
					ctx.fillStyle = '#0d1013';
					ctx.fillRect(bx + ox, oy, bw, bh);
				}
				ctx.restore();
				bubblePath(ctx, ox, oy);
				ctx.strokeStyle = CYAN;
				ctx.globalAlpha = 0.55;
				ctx.lineWidth = 1;
				ctx.stroke();
				ctx.globalAlpha = 1;
				return;
			}
			bubblePath(ctx, ox, oy);
			ctx.fillStyle = fill;
			ctx.fill();
			if (!mine) {
				ctx.strokeStyle = CYAN;
				ctx.globalAlpha = 0.45;
				ctx.lineWidth = 1;
				ctx.stroke();
				ctx.globalAlpha = 1;
			}
			let ty = oy + padY;
			for (const b of paras) {
				drawInk(
					ctx,
					{ ...b, lines: b.lines.map((l) => ({ ...l, x: bx + ox + padX, y: ty + l.y + px * 0.98 })) },
					1,
					{ font: t.body(px), color: ink },
				);
				ty += b.height + lh * 0.55;
			}
		};

		s.push({
			y,
			h: bh + 24,
			reveal: mine ? s.vh * 0.08 : s.vh * 0.26,
			lead: s.vh * 0.3,
			draw(ctx, p, info) {
				const landAt = mine ? 0.35 : TYPING;
				if (p < landAt) {
					if (mine) return;
					// typing bubble — three dots bouncing in sequence
					const tw = 62;
					const th = 36;
					ctx.beginPath();
					(ctx as any).roundRect(x, 0, tw, th, [r, r, r, 5]);
					ctx.fillStyle = '#0d1013';
					ctx.fill();
					ctx.strokeStyle = CYAN;
					ctx.globalAlpha = 0.45;
					ctx.stroke();
					ctx.globalAlpha = 1;
					for (let d = 0; d < 3; d++) {
						const ph = (info.t * 2.6 - d * 0.18) % 1;
						const lift = ph < 0.35 ? Math.sin((ph / 0.35) * Math.PI) : 0;
						ctx.globalAlpha = 0.45 + lift * 0.55;
						ctx.fillStyle = d === 1 && lift > 0.6 ? t.accent : CYAN;
						ctx.beginPath();
						ctx.arc(x + 17 + d * 14, th / 2 - lift * 5, 4, 0, Math.PI * 2);
						ctx.fill();
					}
					ctx.globalAlpha = 1;
					return;
				}
				if (poppedAt < 0) poppedAt = info.t;
				const g = info.reduce ? 1 : Math.min(1, (info.t - poppedAt) / POP);
				const chaos = 1 - g;
				if (chaos > 0) {
					// land with a torn RGB split that settles
					const sp = chaos * 9;
					ctx.save();
					ctx.globalCompositeOperation = 'lighter';
					ctx.globalAlpha = 0.5 * chaos;
					bubblePath(ctx, -sp, sp * 0.3);
					ctx.fillStyle = SPLIT[0];
					ctx.fill();
					bubblePath(ctx, sp, -sp * 0.3);
					ctx.fillStyle = SPLIT[1];
					ctx.fill();
					ctx.restore();
					const bands = 5;
					for (let b = 0; b < bands; b++) {
						ctx.save();
						ctx.beginPath();
						ctx.rect(bx - 40, (b * bh) / bands, bw + 80, bh / bands + 1);
						ctx.clip();
						const dx = hash(Math.floor(info.t * 30), i, b) < 0.45 ? (hash(i, b, Math.floor(info.t * 30)) - 0.5) * 36 * chaos : 0;
						paint(ctx, dx, 0);
						ctx.restore();
					}
				} else {
					paint(ctx, 0, 0);
				}
				if (last && mine) mono(ctx, 'DELIVERED', x + w - 80, bh + 18, t.mono(10), t.dim, 2);
			},
		});

		const next = msgs[i + 1];
		s.cursor = y + bh + (next && next.from === m.from && !next.at ? 6 : 14);
	});

	if (cut && o.moreHref) readMore(s, t, o.moreHref, o.them, x, w);
	s.cursor += 40;
}

/** Teaser ending for a cut-off thread: `them` still typing, then a button
 *  through to the full piece. */
function readMore(s: Sheet, t: Theme, href: string, them: string, x: number, w: number) {
	const CYAN = SPLIT[1];
	const r = 18;
	const y = s.cursor + 18;
	const label = s.W < 620 ? '[ READ FULL INTERVIEW -> ]' : '[ READ THE FULL INTERVIEW  -> ]';
	const bpx = s.W < 620 ? 11 : 14;
	const bh = 54;
	const by = 66;
	let bw = 0;
	s.push({
		y,
		h: by + bh + 30,
		reveal: s.vh * 0.25,
		lead: s.vh * 0.3,
		draw(ctx, p, info) {
			// typing bubble that never resolves
			mono(ctx, `> ${them.toUpperCase()} IS TYPING`, x + 4, 10, t.mono(10), CYAN, 3, 0.8);
			ctx.beginPath();
			(ctx as any).roundRect(x, 18, 62, 36, [r, r, r, 5]);
			ctx.fillStyle = '#0d1013';
			ctx.fill();
			ctx.strokeStyle = CYAN;
			ctx.globalAlpha = 0.45;
			ctx.stroke();
			ctx.globalAlpha = 1;
			for (let d = 0; d < 3; d++) {
				const ph = (info.t * 2.6 - d * 0.18) % 1;
				const lift = ph < 0.35 ? Math.sin((ph / 0.35) * Math.PI) : 0;
				ctx.globalAlpha = 0.45 + lift * 0.55;
				ctx.fillStyle = CYAN;
				ctx.beginPath();
				ctx.arc(x + 17 + d * 14, 36 - lift * 5, 4, 0, Math.PI * 2);
				ctx.fill();
			}
			ctx.globalAlpha = 1;

			// the button
			const a = Math.min(1, Math.max(0, (p - 0.3) / 0.5));
			if (a <= 0) return;
			ctx.save();
			ctx.font = t.mono(bpx);
			(ctx as any).letterSpacing = '3px';
			const tw = ctx.measureText(label).width;
			(ctx as any).letterSpacing = '0px';
			ctx.restore();
			bw = Math.min(w, tw + 48);
			const bx = x + (w - bw) / 2;
			const step = Math.floor(info.t * 12);
			const glitch = !info.reduce && hash(step, 901) < 0.08;
			const dx = glitch ? (hash(step, 902) - 0.5) * 14 : 0;
			ctx.globalAlpha = a;
			if (glitch) {
				ctx.fillStyle = SPLIT[0];
				ctx.fillRect(bx - 4 + dx, by + 3, bw, bh);
				ctx.fillStyle = SPLIT[1];
				ctx.fillRect(bx + 4 - dx, by - 3, bw, bh);
			}
			ctx.fillStyle = t.accent;
			ctx.fillRect(bx + dx, by, bw * Math.min(1, a * 1.4), bh);
			brackets(ctx, bx - 10, by - 10, bw + 20, bh + 20, a, { color: t.accent, width: 2, len: 14 });
			mono(ctx, label, bx + dx + (bw - tw) / 2, by + bh / 2 + bpx * 0.36, t.mono(bpx), t.ground, 3, a);
			const pulse = 0.5 + 0.5 * Math.sin(info.t * 3);
			mono(ctx, '█', bx + bw + 18, by + bh / 2 + bpx * 0.36, t.mono(bpx), t.accent, 0, a * pulse);
			ctx.globalAlpha = 1;
		},
	});
	// generous hit area over the button row
	s.hotspot({ x, y: y + by - 12, w, h: bh + 24 }, 'read-more', href);
	s.cursor = y + by + bh + 30;
}

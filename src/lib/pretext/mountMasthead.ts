// The cover wordmark, mildly possessed.
//
// pretext fits "ROACHWORLD" to the width (measureNaturalWidth) and hands back
// per-glyph boxes (prefix widths) so individual letters can be displaced or
// swapped without the rest shifting. During a glitch burst the word is also
// re-typeset every frame at a randomly changing max-width via layoutNextLineRange
// — it can't decide how many lines it wants, and snaps back.

import {
	prepareWithSegments,
	measureNaturalWidth,
	layoutNextLineRange,
	materializeLineRange,
	type LayoutCursor,
} from '@chenglou/pretext';
import { fontsReady, onFontsChanged } from './fonts';
import { FONT } from './fonts';
import { INK } from '../../consts';

// The masthead keeps its own ink values so it stays put through palette edits.
const M_BLACK = '#22201c';
const M_BLUE = '#0e5ad6';

type Channel = {
	ink: string;
	bx: number;
	by: number;
	mode: GlobalCompositeOperation;
	alpha: number;
	stroke?: string;
	strokeW?: number;
};

// Black wordmark on newsprint: yellow stamp one way, blue the other, black on top.
const CHANNELS: Channel[] = [
	{ ink: INK.pink, bx: 3.2, by: -1.4, mode: 'source-over', alpha: 0.85 },
	{ ink: M_BLUE, bx: -3.4, by: 1.8, mode: 'multiply', alpha: 0.9 },
	{ ink: M_BLACK, bx: 0, by: 0, mode: 'multiply', alpha: 0.95 },
];

const GLITCH = [...'▚▞▙▟▛▜░▒▓█╱╲│┃<>=×+#§¤@'];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: readonly T[]): T => a[(Math.random() * a.length) | 0];
const chance = (p: number) => Math.random() < p;

export function mountMasthead(canvas: HTMLCanvasElement) {
	const text = canvas.dataset.text || 'ROACHWORLD';
	const subtitle = (canvas.dataset.subtitle || '').toUpperCase();
	const ratio = Number(canvas.dataset.ratio || '0.3');
	const ctx = canvas.getContext('2d')!;
	const reduce =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const canTrack =
		typeof CanvasRenderingContext2D !== 'undefined' &&
		'letterSpacing' in CanvasRenderingContext2D.prototype;

	let W = 0;
	let H = 0;
	let size = 0;
	let baseline = 0;
	let cx = 0;
	let fullW = 0;
	let mobile = false;
	let glyphs: { ch: string; x: number; w: number }[] = [];
	let bg: HTMLCanvasElement | null = null;

	let raf = 0;
	let looping = false;
	let onScreen = true;

	// glitch state
	let mode: 'idle' | 'burst' = 'idle';
	let nextBurst = 0;
	let burstEnd = 0;
	let fx: string[] = [];
	let scrambleIdx: number[] = [];
	let scrambleChars: string[] = [];
	let scrambleTick = 0;

	function setFont(px: number) {
		ctx.font = FONT.display(px);
		if (canTrack) (ctx as any).letterSpacing = `${-px * 0.02}px`;
	}
	function clearTrack() {
		if (canTrack) (ctx as any).letterSpacing = '0px';
	}

	function buildBackground() {
		const c = document.createElement('canvas');
		const dpr = Math.min(devicePixelRatio || 1, 2);
		c.width = Math.round(W * dpr);
		c.height = Math.round(H * dpr);
		const g = c.getContext('2d')!;
		g.scale(dpr, dpr);
		g.fillStyle = INK.paper; // newsprint
		g.fillRect(0, 0, W, H);
		const s = 130;
		const tile = document.createElement('canvas');
		tile.width = tile.height = s;
		const tg = tile.getContext('2d')!;
		const im = tg.createImageData(s, s);
		for (let i = 0; i < im.data.length; i += 4) {
			const v = 128 + (Math.random() - 0.5) * 200;
			im.data[i] = im.data[i + 1] = im.data[i + 2] = v;
			im.data[i + 3] = Math.random() * 12;
		}
		tg.putImageData(im, 0, 0);
		const pat = g.createPattern(tile, 'repeat');
		if (pat) {
			g.globalCompositeOperation = 'multiply';
			g.fillStyle = pat;
			g.fillRect(0, 0, W, H);
		}
		bg = c;
	}

	function fit() {
		const parent = canvas.parentElement!;
		W = Math.max(240, Math.round(parent.clientWidth));
		// Taller panel on narrow screens so the wordmark + two-line sub-line + the
		// circled note all have room.
		const effRatio = W < 480 ? 0.68 : W < 760 ? 0.44 : ratio;
		H = Math.max(120, Math.round(W * effRatio));
		mobile = W < 480;

		const REF = 100;
		const natRef = measureNaturalWidth(
			prepareWithSegments(text, FONT.display(REF), { letterSpacing: -REF * 0.02 }),
		);
		size = Math.min(((W * 0.92) / natRef) * REF, H * (mobile ? 0.34 : 0.52));
		const ls = -size * 0.02;
		fullW = measureNaturalWidth(prepareWithSegments(text, FONT.display(size), { letterSpacing: ls }));
		cx = W / 2;
		baseline = Math.round(H * (mobile ? 0.42 : 0.62));

		glyphs = [];
		const chars = [...text];
		let prev = 0;
		for (let i = 0; i < chars.length; i++) {
			const w = measureNaturalWidth(
				prepareWithSegments(chars.slice(0, i + 1).join(''), FONT.display(size), { letterSpacing: ls }),
			);
			glyphs.push({ ch: chars[i], x: prev, w: w - prev });
			prev = w;
		}

		const dpr = Math.min(devicePixelRatio || 1, 2);
		canvas.width = Math.round(W * dpr);
		canvas.height = Math.round(H * dpr);
		canvas.style.width = `${W}px`;
		canvas.style.height = `${H}px`;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		buildBackground();
	}

	// ── drawing pieces ──────────────────────────────────────────────────────
	function blitBg() {
		if (bg) ctx.drawImage(bg, 0, 0, W, H);
	}

	function channelText(str: string, x: number, y: number, amp: number, px = size) {
		setFont(px);
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		for (const ch of CHANNELS) {
			ctx.save();
			ctx.globalCompositeOperation = ch.mode;
			ctx.globalAlpha = ch.alpha;
			const jx = ch.bx + ch.bx * amp * 0.25 + (Math.random() - 0.5) * amp * 0.9;
			const jy = ch.by + ch.by * amp * 0.2 + (Math.random() - 0.5) * amp * 0.5;
			if (ch.stroke) {
				ctx.lineJoin = 'round';
				ctx.lineWidth = px * (ch.strokeW ?? 0.1);
				ctx.strokeStyle = ch.stroke;
				ctx.strokeText(str, x + jx, y + jy);
			}
			ctx.fillStyle = ch.ink;
			ctx.fillText(str, x + jx, y + jy);
			ctx.restore();
		}
		clearTrack();
	}

	function drawGlyphs(chars: string[], x0: number, amp: number) {
		setFont(size);
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';
		for (const ch of CHANNELS) {
			ctx.save();
			ctx.globalCompositeOperation = ch.mode;
			ctx.globalAlpha = ch.alpha;
			ctx.lineJoin = 'round';
			ctx.lineWidth = size * (ch.strokeW ?? 0.1);
			for (let i = 0; i < glyphs.length; i++) {
				const jx = ch.bx + ch.bx * amp * 0.25 + (Math.random() - 0.5) * amp * 1.1;
				const jy = ch.by + (Math.random() - 0.5) * amp * 0.6;
				const gx = x0 + glyphs[i].x + jx;
				const gc = chars[i] ?? glyphs[i].ch;
				if (ch.stroke) {
					ctx.strokeStyle = ch.stroke;
					ctx.strokeText(gc, gx, baseline + jy);
				}
				ctx.fillStyle = ch.ink;
				ctx.fillText(gc, gx, baseline + jy);
			}
			ctx.restore();
		}
		clearTrack();
	}

	function drawSubtitle(amp: number) {
		if (!subtitle) return;
		// "A DIGITAL MAGAZINE BY JORDAN WALENDOM" → two lines, breaking at BY.
		const m = subtitle.match(/^(.*?)\s+(BY\s+.*)$/i);
		const lines = m ? [m[1], m[2]] : [subtitle];

		let px = Math.max(9, size * (mobile ? 0.11 : 0.075));
		let track = mobile ? 1.5 : 4;

		// Shrink to fit the panel width (pretext measures the longer line).
		const maxLine = () =>
			Math.max(
				...lines.map(
					(l) =>
						measureNaturalWidth(prepareWithSegments(l, FONT.kicker(px), { letterSpacing: track })),
				),
			);
		const cap = W * 0.94;
		for (let i = 0; i < 6 && maxLine() > cap; i++) {
			px *= cap / maxLine();
			track *= 0.85;
		}

		ctx.save();
		ctx.font = FONT.kicker(px);
		if (canTrack) (ctx as any).letterSpacing = `${track}px`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'alphabetic';
		ctx.fillStyle = M_BLACK;
		ctx.globalAlpha = amp > 4 && chance(0.3) ? 0.25 : 1;
		let sy = baseline + (mobile ? H * 0.16 : size * 0.36);
		for (const line of lines) {
			ctx.fillText(line, cx + (Math.random() - 0.5) * amp, sy);
			sy += px * 1.9;
		}
		ctx.restore();
		if (canTrack) (ctx as any).letterSpacing = '0px';
	}

	function drawMarks(amp: number) {
		const t = amp > 3 ? rnd(-amp, amp) : 0;
		[M_BLUE, INK.pink, M_BLACK].forEach((ink, i) => {
			ctx.fillStyle = ink;
			ctx.fillRect(14 + i * 10 + t, 14, 6, 22);
			ctx.fillRect(14, 14 + i * 8, 22, 4);
		});
	}

	// ── frames ──────────────────────────────────────────────────────────────
	function drawClean(amp: number) {
		blitBg();
		channelText(text, cx - fullW / 2, baseline, amp);
		drawSubtitle(amp);
		drawMarks(amp);
	}

	function drawBurst(now: number) {
		blitBg();
		const amp = rnd(3, 12);

		if (fx.includes('reflow')) {
			const r = 0.24 + 0.8 * (0.5 + 0.5 * Math.sin(now * 0.025 + 1)) + rnd(-0.1, 0.1);
			const maxW = Math.max(size * 1.1, r * W);
			const prep = prepareWithSegments(text, FONT.display(size), { letterSpacing: -size * 0.02 });
			let cur: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
			const lines: string[] = [];
			while (lines.length < 8) {
				const range = layoutNextLineRange(prep, cur, maxW);
				if (!range) break;
				lines.push(materializeLineRange(prep, range).text);
				cur = range.end;
			}
			const lh = size * 0.98;
			let y = baseline - (lines.length - 1) * lh * 0.5;
			for (const ln of lines) {
				const w = measureNaturalWidth(
					prepareWithSegments(ln, FONT.display(size), { letterSpacing: -size * 0.02 }),
				);
				channelText(ln, cx - w / 2 + rnd(-amp, amp), y, amp);
				y += lh;
			}
		} else if (fx.includes('slice')) {
			const bands = 5 + ((Math.random() * 11) | 0);
			for (let i = 0; i < bands; i++) {
				const y0 = (i / bands) * H;
				const bh = H / bands;
				const shift = chance(0.6) ? rnd(-1, 1) * rnd(3, 34) : 0;
				ctx.save();
				ctx.beginPath();
				ctx.rect(0, y0, W, bh + 0.5);
				ctx.clip();
				ctx.translate(shift, chance(0.12) ? rnd(-4, 4) : 0);
				channelText(text, cx - fullW / 2, baseline, amp);
				ctx.restore();
			}
			drawSubtitle(amp);
		} else if (fx.includes('scramble')) {
			if (now - scrambleTick > 45) {
				scrambleTick = now;
				scrambleChars = glyphs.map((g, i) =>
					scrambleIdx.includes(i) && chance(0.85) ? pick(GLITCH) : g.ch,
				);
			}
			drawGlyphs(scrambleChars.length ? scrambleChars : glyphs.map((g) => g.ch), cx - fullW / 2, amp);
			drawSubtitle(amp);
		} else {
			channelText(text, cx - fullW / 2, baseline, amp);
			drawSubtitle(amp);
		}

		if (fx.includes('ghost')) {
			ctx.save();
			ctx.globalAlpha = 0.28;
			channelText(text, cx - fullW / 2 + rnd(-40, 40), baseline + rnd(-6, 6), amp * 0.6);
			ctx.restore();
		}

		// stray tear line
		if (chance(0.25)) {
			ctx.fillStyle = chance(0.5) ? INK.pink : M_BLUE;
			ctx.fillRect(0, rnd(0, H), W, rnd(1, 3));
		}
		drawMarks(amp);
	}

	let lastIdleDraw = 0;
	function frame(now: number) {
		if (!looping) return;

		if (mode === 'idle') {
			if (now >= nextBurst) {
				mode = 'burst';
				burstEnd = now + rnd(90, 430);
				const all = ['slice', 'scramble', 'reflow', 'ghost'];
				fx = [];
				const n = chance(0.35) ? 2 : 1;
				while (fx.length < n) {
					const e = pick(all);
					if (!fx.includes(e)) fx.push(e);
				}
				scrambleIdx = [];
				const k = 1 + ((Math.random() * 3) | 0);
				while (scrambleIdx.length < k) {
					const i = (Math.random() * glyphs.length) | 0;
					if (!scrambleIdx.includes(i)) scrambleIdx.push(i);
				}
				scrambleChars = [];
			} else if (now - lastIdleDraw > 80) {
				lastIdleDraw = now;
				drawClean(rnd(0.7, 1.6));
			}
		}

		if (mode === 'burst') {
			if (now >= burstEnd) {
				mode = 'idle';
				nextBurst = now + rnd(1300, 4400);
				drawClean(1);
			} else {
				drawBurst(now);
			}
		}

		raf = requestAnimationFrame(frame);
	}

	function start() {
		if (looping || reduce) return;
		looping = true;
		nextBurst = performance.now() + rnd(500, 2200);
		raf = requestAnimationFrame(frame);
	}
	function stop() {
		looping = false;
		cancelAnimationFrame(raf);
	}

	// ── lifecycle ───────────────────────────────────────────────────────────
	(async () => {
		await fontsReady();
		fit();
		drawClean(1);
		canvas.dataset.painted = '';

		if (reduce) return;

		const io = new IntersectionObserver((entries) => {
			onScreen = entries.some((e) => e.isIntersecting);
			if (onScreen && !document.hidden) start();
			else stop();
		});
		io.observe(canvas);

		document.addEventListener('visibilitychange', () => {
			if (document.hidden) stop();
			else if (onScreen) start();
		});

		let rt: number | undefined;
		new ResizeObserver(() => {
			clearTimeout(rt);
			rt = window.setTimeout(() => {
				const wasLooping = looping;
				stop();
				fit();
				drawClean(1);
				if (wasLooping) start();
			}, 150);
		}).observe(canvas.parentElement!);

		onFontsChanged(() => {
			fit();
			drawClean(1);
		});
	})();
}

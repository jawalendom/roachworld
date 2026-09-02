// The article-break number, typeset in.
//
// pretext measures the geometry the animation runs on: the exact kerned width of
// the numerals (with negative letter-spacing modelled), and how the label's
// width responds to tracking. The animation then keeps a mono label edge-matched
// to the number as both move — a width you can't get from the DOM without a
// reflow, and can't fake with `measureText` on the whole string once tracking
// changes.

import { prepareWithSegments, measureNaturalWidth } from '@chenglou/pretext';
import { fontsReady, onFontsChanged } from './fonts';
import { FONT } from './fonts';
import { INK } from '../../consts';

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
	const c = 1.7;
	return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const seg = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

interface Geom {
	cssW: number;
	cssH: number;
	numSize: number;
	numLs: number;
	numW: number;
	digits: { ch: string; x: number }[];
	baseline: number;
	ruleY: number;
	ruleH: number;
	label: string;
	labelSize: number;
	labelBaseW: number;
	labelSlope: number;
	labelBaseline: number;
}

const DURATION = 720;

export function mountArticleNumber(canvas: HTMLCanvasElement) {
	const numText = (canvas.dataset.n || '00').trim();
	const label = (canvas.dataset.label || '').trim().toUpperCase();
	const ctx = canvas.getContext('2d')!;
	const reduce =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const canTrack =
		typeof CanvasRenderingContext2D !== 'undefined' &&
		'letterSpacing' in CanvasRenderingContext2D.prototype;

	let geom: Geom | null = null;
	let raf = 0;
	let running = false;
	let settled = false;

	function build() {
		const parent = canvas.parentElement!;
		const colW = Math.max(72, Math.round(parent.clientWidth));
		const numSize = Math.min(Math.round(colW * 0.9), 72);
		const numLs = -numSize * 0.03;

		// Per-digit left edge, from pretext prefix widths (kerning-aware).
		const chars = [...numText];
		const digits: { ch: string; x: number }[] = [];
		let acc = 0;
		for (let i = 0; i < chars.length; i++) {
			digits.push({ ch: chars[i], x: acc });
			acc = measureNaturalWidth(
				prepareWithSegments(chars.slice(0, i + 1).join(''), FONT.display(numSize), {
					letterSpacing: numLs,
				}),
			);
		}
		const numW = acc;

		const labelSize = Math.max(9, Math.round(numSize * 0.2));
		const lf = FONT.kicker(labelSize);
		const w0 = label ? measureNaturalWidth(prepareWithSegments(label, lf, { letterSpacing: 0 })) : 0;
		const w8 = label ? measureNaturalWidth(prepareWithSegments(label, lf, { letterSpacing: 8 })) : 1;
		const labelSlope = (w8 - w0) / 8 || 1;

		const baseline = Math.round(numSize * 0.82);
		const ruleY = Math.round(numSize * 0.98);
		const ruleH = Math.max(2, Math.round(numSize * 0.055));
		const labelBaseline = ruleY + ruleH + labelSize * 1.35;
		const cssH = Math.ceil(labelBaseline + labelSize * 0.5);

		// The label is tracked to the numeral width, so the canvas only needs to
		// be as wide as the wider of {column, numerals}. Bleed into the gutter.
		const cssW = Math.ceil(Math.max(colW, numW) + 3);

		const dpr = Math.min(devicePixelRatio || 1, 2);
		canvas.width = Math.round(cssW * dpr);
		canvas.height = Math.round(cssH * dpr);
		canvas.style.width = `${cssW}px`;
		canvas.style.height = `${cssH}px`;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		geom = {
			cssW,
			cssH,
			numSize,
			numLs,
			numW,
			digits,
			baseline,
			ruleY,
			ruleH,
			label,
			labelSize,
			labelBaseW: w0,
			labelSlope,
			labelBaseline,
		};
	}

	function drawTracked(text: string, x: number, y: number, ls: number) {
		if (canTrack) {
			(ctx as any).letterSpacing = `${ls}px`;
			ctx.fillText(text, x, y);
			(ctx as any).letterSpacing = '0px';
			return;
		}
		let cx = x;
		for (const ch of text) {
			ctx.fillText(ch, cx, y);
			cx += ctx.measureText(ch).width + ls;
		}
	}

	function render(p: number) {
		const g = geom;
		if (!g) return;
		ctx.clearRect(0, 0, g.cssW, g.cssH);
		ctx.textAlign = 'left';
		ctx.textBaseline = 'alphabetic';

		// yellow highlight block, wipes in behind the numerals
		const blockP = easeOutCubic(seg(p, 0, 0.5));
		const blockH = g.numSize * 0.78;
		const blockY = g.baseline - g.numSize * 0.64;
		if (blockP > 0) {
			ctx.fillStyle = INK.pink;
			ctx.fillRect(-3, blockY, (g.numW + 6 + g.numSize * 0.1) * blockP, blockH);
		}

		// numerals: white with a hard black outline, stagger-dropped
		ctx.font = FONT.display(g.numSize);
		if (canTrack) (ctx as any).letterSpacing = `${g.numLs}px`;
		ctx.lineJoin = 'round';
		ctx.lineWidth = Math.max(2, g.numSize * 0.07);
		g.digits.forEach((d, i) => {
			const dp = seg(p, 0.06 + i * 0.14, 0.55 + i * 0.14);
			if (dp <= 0) return;
			const e = easeOutBack(dp);
			const ch = canTrack ? d.ch : numText[i] ?? d.ch;
			ctx.save();
			ctx.globalAlpha = clamp01(dp * 2.5);
			ctx.translate(d.x, g.baseline - (1 - e) * g.numSize * 0.4);
			ctx.strokeStyle = '#141210';
			ctx.strokeText(ch, 0, 0);
			ctx.fillStyle = '#ffffff';
			ctx.fillText(ch, 0, 0);
			ctx.restore();
		});
		if (canTrack) (ctx as any).letterSpacing = '0px';

		// label: tracking expands so it lands flush with the numeral width
		if (g.label) {
			const lp = easeOutCubic(seg(p, 0.5, 1));
			if (lp > 0) {
				const fullLs = Math.max(0, (g.numW - g.labelBaseW) / g.labelSlope);
				ctx.save();
				ctx.globalAlpha = lp;
				ctx.font = FONT.kicker(g.labelSize);
				ctx.fillStyle = '#141210';
				drawTracked(g.label, 0, g.labelBaseline, fullLs * lp);
				ctx.restore();
			}
		}
	}

	function play() {
		cancelAnimationFrame(raf);
		if (reduce) {
			render(1);
			settled = true;
			return;
		}
		running = true;
		settled = false;
		const t0 = performance.now();
		const step = (now: number) => {
			const p = clamp01((now - t0) / DURATION);
			render(p);
			if (p < 1) {
				raf = requestAnimationFrame(step);
			} else {
				running = false;
				settled = true;
			}
		};
		raf = requestAnimationFrame(step);
	}

	(async () => {
		await fontsReady();
		build();
		// Start from the finished state, so the number is always visible even if
		// the observer never gets a clean "entered" event (e.g. it loads already
		// parked at an in-between scroll position).
		settled = true;
		render(1);
		canvas.dataset.ready = '';

		// Replay every time the number scrolls back into view. Trigger on any
		// visibility (past a bottom margin); re-arm only once it's fully gone.
		let armed = true;
		const io = new IntersectionObserver(
			(entries) => {
				for (const e of entries) {
					if (e.isIntersecting) {
						if (armed) {
							armed = false;
							play();
						}
					} else if (e.intersectionRatio === 0) {
						armed = true;
					}
				}
			},
			{ threshold: [0, 1], rootMargin: '0px 0px -12% 0px' },
		);
		io.observe(canvas);

		// Only rebuild on a genuine viewport width change — NOT on the layout
		// reflows that happen while the masthead and images settle (those would
		// otherwise cancel the first number's animation mid-flight).
		let rt: number | undefined;
		let lastW = window.innerWidth;
		window.addEventListener('resize', () => {
			if (window.innerWidth === lastW) return;
			lastW = window.innerWidth;
			clearTimeout(rt);
			rt = window.setTimeout(() => {
				cancelAnimationFrame(raf);
				running = false;
				settled = true;
				armed = true;
				build();
				render(1);
			}, 200);
		});

		onFontsChanged(() => {
			if (running) return;
			build();
			render(1);
			settled = true;
		});
	})();
}

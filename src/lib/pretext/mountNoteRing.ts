// A pen circling the handwritten note: it draws an oval around the text, holds,
// fades, pauses, and re-draws with a fresh wobble each time.
//
// pretext measures the note — each line's natural width via measureNaturalWidth
// with the note's own resolved font — so the oval is sized to the actual text,
// not a guess or a DOM read.

import { prepareWithSegments, measureNaturalWidth } from '@chenglou/pretext';
import { fontsReady, onFontsChanged } from './fonts';

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

const T_DRAW = 820;
const T_HOLD = 1500;
const T_FADE = 460;
const T_PAUSE = 780;
const CYCLE = T_DRAW + T_HOLD + T_FADE + T_PAUSE;

interface Ring {
	cx: number;
	cy: number;
	rx: number;
	ry: number;
	pts: { x: number; y: number }[];
}

export function mountNoteRing(canvas: HTMLCanvasElement) {
	const note = canvas.parentElement?.querySelector<HTMLElement>('.masthead-note');
	if (!note) return;
	const ctx = canvas.getContext('2d')!;
	const reduce =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const lines = (canvas.dataset.note || note.innerText || '').split('\n').filter(Boolean);

	let ring: Ring | null = null;
	let ink = '#0e5ad6';
	let raf = 0;
	let running = false;
	let t0 = 0;

	function buildPath(seed: number): { x: number; y: number }[] {
		if (!ring) return [];
		const { cx, cy, rx, ry } = ring;
		const N = 150;
		const start = -Math.PI * 0.52 + rnd(-0.25, 0.25);
		const sweep = Math.PI * 2 + rnd(0.18, 0.55); // overshoot past the start
		const w1 = rnd(2, 3.5);
		const w2 = rnd(3.5, 6);
		const p1 = seed * 1.3;
		const p2 = seed * 2.7 + 1;
		const relAmp = 0.055;
		const pts: { x: number; y: number }[] = [];
		for (let i = 0; i <= N; i++) {
			const f = i / N;
			const a = start + sweep * f;
			const wob = (Math.sin(a * w1 + p1) * 0.55 + Math.sin(a * w2 + p2) * 0.45) * relAmp;
			const drift = (f - 0.5) * 0.02; // slight spiral
			const r = 1 + wob + drift;
			pts.push({ x: cx + Math.cos(a) * rx * r, y: cy + Math.sin(a) * ry * r });
		}
		return pts;
	}

	function build() {
		const cs = getComputedStyle(note!);
		const fontPx = parseFloat(cs.fontSize) || 18;
		const lh = parseFloat(cs.lineHeight) || fontPx * 1.1;
		const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
		ink = cs.color || ink;

		let textW = 0;
		for (const line of lines) {
			textW = Math.max(textW, measureNaturalWidth(prepareWithSegments(line, font)));
		}
		const textH = lh * Math.max(1, lines.length);

		const rx = textW / 2 + fontPx * 1.05;
		const ry = textH / 2 + fontPx * 0.5;
		const margin = fontPx * 1.1; // wobble + overshoot headroom

		const cssW = Math.ceil((rx + margin) * 2);
		const cssH = Math.ceil((ry + margin) * 2);
		const dpr = Math.min(devicePixelRatio || 1, 2);
		canvas.width = Math.round(cssW * dpr);
		canvas.height = Math.round(cssH * dpr);
		canvas.style.width = `${cssW}px`;
		canvas.style.height = `${cssH}px`;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

		ring = { cx: cssW / 2, cy: cssH / 2, rx, ry, pts: [] };
		ring.pts = buildPath(Math.random() * 1000);
	}

	// Draw the ring from the start up to `reach` points (fractional), at `alpha`.
	function stroke(reach: number, alpha: number) {
		if (!ring) return;
		const pts = ring.pts;
		const last = pts.length - 1;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		const n = Math.min(last, Math.floor(reach));
		if (n < 1 || alpha <= 0) return;

		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.strokeStyle = ink;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.lineWidth = Math.max(2, ring.rx * 0.022);
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

	function frame(now: number) {
		if (!running || !ring) return;
		const elapsed = now - t0;
		const phase = elapsed % CYCLE;
		const cycle = Math.floor(elapsed / CYCLE);
		// regenerate the wobble once per cycle
		if (ring.pts.length === 0 || (ring as any)._cycle !== cycle) {
			ring.pts = buildPath(cycle + 1 + Math.random());
			(ring as any)._cycle = cycle;
		}
		const total = ring.pts.length - 1;

		if (phase < T_DRAW) {
			const p = easeInOut(clamp01(phase / T_DRAW));
			stroke(p * total, 1);
		} else if (phase < T_DRAW + T_HOLD) {
			stroke(total, 1);
		} else if (phase < T_DRAW + T_HOLD + T_FADE) {
			const p = clamp01((phase - T_DRAW - T_HOLD) / T_FADE);
			stroke(total, 1 - p);
		} else {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
		}
		raf = requestAnimationFrame(frame);
	}

	function start() {
		if (running || reduce) return;
		running = true;
		t0 = performance.now();
		raf = requestAnimationFrame(frame);
	}
	function stop() {
		running = false;
		cancelAnimationFrame(raf);
	}

	(async () => {
		await fontsReady();
		build();

		if (reduce) {
			stroke(ring!.pts.length - 1, 1);
			return;
		}

		let onScreen = true;
		new IntersectionObserver((entries) => {
			onScreen = entries.some((e) => e.isIntersecting);
			if (onScreen && !document.hidden) start();
			else stop();
		}).observe(canvas);

		document.addEventListener('visibilitychange', () => {
			if (document.hidden) stop();
			else if (onScreen) start();
		});

		let rt: number | undefined;
		let lastW = window.innerWidth;
		window.addEventListener('resize', () => {
			if (window.innerWidth === lastW) return;
			lastW = window.innerWidth;
			clearTimeout(rt);
			rt = window.setTimeout(() => {
				const was = running;
				stop();
				build();
				if (was) start();
			}, 180);
		});

		onFontsChanged(() => {
			const was = running;
			stop();
			build();
			if (was) start();
			else stroke(ring!.pts.length - 1, 1);
		});
	})();
}

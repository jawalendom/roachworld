// Roaches crawling across the screen, drawn as ASCII — the ascii-magic idea
// (image → brightness per cell → a character from a density ramp) run live.
// The simulation is field.ts; this mounts it full-size with a size control.
//
// Glyphs are pre-rendered once per size into an atlas; WebGL then draws the whole
// grid in one pass (glGrid.ts), with per-cell `drawImage` as the fallback — no
// text shaping per frame either way.
//
// pretext supplies the cell geometry: the mono face's exact advance at the chosen
// size, measured without touching the DOM (no layout, no reflow), so changing
// the size re-grids instantly.
//
// Zoomed out (smaller characters) the roaches run faster and a swarm of small
// ones pours in. Tap a roach to squash it — it splats and stays where it died.

import { prepareWithSegments, measureNaturalWidth } from '@chenglou/pretext';
import { fontsReady, onFontsChanged, FONT } from '../pretext/fonts';
import { makeGlGrid } from './glGrid';
import { createRoachField, RAMP, INKS, BG, REF } from './field';

export interface AsciiRoaches {
	setSize(px: number): void;
}

export async function mountAsciiRoaches(host: HTMLElement, o: { size?: number; count?: number; strip?: boolean; onSquash?: (n: number) => void } = {}): Promise<AsciiRoaches> {
	await fontsReady();
	const canvas = document.createElement('canvas');
	canvas.setAttribute('aria-hidden', 'true');
	host.prepend(canvas);
	// WebGL draws the whole grid in one pass; the 2D canvas is the fallback
	const glg = makeGlGrid(canvas, [5 / 255, 5 / 255, 6 / 255]);
	const g = glg ? null : canvas.getContext('2d')!;
	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
	// strip: a short band on the issue page — a few roaches, mostly crossing
	// left ↔ right, at one fixed size
	const field = createRoachField(o.strip ? { count: 3, horizontal: true, dots: false } : { count: o.count, dots: false });

	let size = o.size ?? 40;
	const GRID = o.strip ? 32 : 48;
	let cw = 0, ch = 0, cols = 0, rows = 0, dpr = 1;
	let refCols = 1, refRows = 1;
	let atlas: HTMLCanvasElement | null = null;
	let clock = 0;

	// 0 at the default size → 1 at the smallest: how far the reader has zoomed out
	const zoomedOut = () => (o.strip ? 0 : Math.max(0, Math.min(1, (40 / size - 1) / (40 / 6 - 1))));

	function measure() {
		const font = FONT.mono(size);
		// pretext: the advance of one mono cell, measured off-DOM
		cw = measureNaturalWidth(prepareWithSegments('@', font)) || size * 0.6;
		ch = size * 1.02;
		const w = host.clientWidth, h = host.clientHeight;
		dpr = Math.min(devicePixelRatio || 1, 2);
		canvas.width = Math.round(w * dpr);
		canvas.height = Math.round(h * dpr);
		cols = Math.ceil(w / cw);
		rows = Math.ceil(h / ch);
		// the world in square units: one reference cell's width
		const unit = measureNaturalWidth(prepareWithSegments('@', FONT.mono(REF))) || REF * 0.6;
		refCols = w / unit;
		refRows = h / unit;
		field.setGrid(cols, rows, refCols, refRows);
		// a fixed grey grid behind it all (48 css px full screen, 32 in the strip),
		// whatever the character size
		glg?.setLines(GRID * dpr, Math.max(1, dpr), [0.12, 0.12, 0.135]);
		field.setZoom(zoomedOut());
		buildAtlas();
	}

	// one row per ink, one column per ramp character
	function buildAtlas() {
		const aw = Math.ceil(cw * dpr), ah = Math.ceil(ch * dpr);
		atlas = document.createElement('canvas');
		atlas.width = aw * RAMP.length;
		atlas.height = ah * INKS.length;
		const a = atlas.getContext('2d')!;
		a.scale(dpr, dpr);
		a.font = FONT.mono(size);
		a.textBaseline = 'middle';
		INKS.forEach((ink, row) => {
			a.fillStyle = ink;
			for (let i = 0; i < RAMP.length; i++) a.fillText(RAMP[i], i * (aw / dpr), row * (ah / dpr) + ch / 2);
		});
		glg?.setAtlas(atlas, RAMP.length, INKS.length);
	}

	function render(t: number) {
		const cells = field.cells(t);
		if (glg) return glg.draw(cells, cols, rows, cw * dpr, ch * dpr);
		if (!g || !atlas) return;
		g.setTransform(1, 0, 0, 1, 0, 0);
		g.fillStyle = BG;
		g.fillRect(0, 0, canvas.width, canvas.height);
		{
			g.fillStyle = '#1e1e22';
			const gap = GRID * dpr, lw = Math.max(1, dpr);
			for (let x = 0; x < canvas.width; x += gap) g.fillRect(x, 0, lw, canvas.height);
			for (let y = 0; y < canvas.height; y += gap) g.fillRect(0, y, canvas.width, lw);
		}
		const aw = Math.ceil(cw * dpr), ah = Math.ceil(ch * dpr);
		for (let n = 0; n < cols * rows; n++) {
			const c = n * 3;
			if (!cells[c + 2]) continue;
			g.globalAlpha = cells[c + 2] / 255;
			g.drawImage(atlas, cells[c] * aw, cells[c + 1] * ah, aw, ah, (n % cols) * cw * dpr, Math.floor(n / cols) * ch * dpr, aw, ah);
		}
		g.globalAlpha = 1;
	}

	// squash: tap/click a roach. Nearby ones bolt.
	canvas.style.cursor = 'crosshair';
	let squashed = 0;
	const squashAt = (e: PointerEvent) => {
		const box = canvas.getBoundingClientRect();
		const x = ((e.clientX - box.left) / box.width) * refCols;
		const y = ((e.clientY - box.top) / box.height) * refRows;
		// generous on touch: a fingertip is big next to a small roach
		if (field.squash(x, y, e.pointerType === 'touch' ? 4 : 1.5, clock)) {
			host.dataset.squashed = String(++squashed);
			o.onSquash?.(squashed);
		}
	};
	// mouse/pen squash on press; a finger squashes on lift, and only if it didn't
	// drag (a drag zooms on phones)
	let touch: { x: number; y: number; moved: boolean } | null = null;
	canvas.addEventListener('pointerdown', (e) => {
		if (e.pointerType !== 'touch') return squashAt(e);
		touch = { x: e.clientX, y: e.clientY, moved: false };
	});
	canvas.addEventListener('pointermove', (e) => {
		if (touch && Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > 10) touch.moved = true;
	});
	canvas.addEventListener('pointerup', (e) => {
		if (e.pointerType === 'touch' && touch && !touch.moved) squashAt(e);
		touch = null;
	});
	canvas.addEventListener('pointercancel', () => (touch = null));

	measure();
	new ResizeObserver(measure).observe(host);
	onFontsChanged(measure);

	let visible = true;
	new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(host);
	let prev = performance.now();
	const t0 = prev;
	const loop = (now: number) => {
		requestAnimationFrame(loop);
		const dt = Math.min(0.05, (now - prev) / 1000);
		prev = now;
		if (!visible) return;
		clock = (now - t0) / 1000;
		// zoomed out, they hurry: up to 6× at the smallest size
		const pace = o.strip ? 1 : Math.min(6, Math.max(1, 40 / size));
		field.step(clock, (reduce ? dt * 0.25 : dt) * pace);
		render(clock);
	};
	requestAnimationFrame(loop);

	return {
		setSize(px: number) {
			size = px;
			measure();
		},
	};
}

// The scroll-driven sheet. A single viewport canvas is pinned while a tall
// spacer scrolls past it; each registered element inks itself in over the
// stretch of scroll where it enters view (Fable-style "draw as you scroll").

import { fontsReady, onFontsChanged } from '../pretext/fonts';
import { makeRng, type Rng } from './rng';

export interface SheetElement {
	y: number;
	h: number;
	/** px of scroll the element inks in over. */
	reveal?: number;
	/** element top must rise to (viewport bottom − this) before it starts. */
	lead?: number;
	/** keep it drawn once revealed (default true). */
	latch?: boolean;
	draw(ctx: CanvasRenderingContext2D, p: number, info: { W: number; vh: number }): void;
	_p?: number;
}

export interface SheetMark {
	id: string;
	y: number;
}

export interface SheetHotspot {
	x: number;
	y: number;
	w: number;
	h: number;
	id: string;
}

export interface Sheet {
	readonly W: number;
	readonly vh: number;
	readonly rng: Rng;
	readonly ground: string;
	cursor: number;
	height: number;
	push(el: SheetElement): void;
	gap(dy: number): void;
	/** record a named scroll target at the current cursor (for the index). */
	mark(id: string): void;
	/** register a clickable region (sheet-content coords) that jumps to mark `id`. */
	hotspot(rect: { x: number; y: number; w: number; h: number }, id: string): void;
}

export interface MountOpts {
	seed: number;
	ground: string;
	grainAlpha?: number;
}

export function mountSheet(
	root: HTMLElement,
	compose: (sheet: Sheet) => void,
	opts: MountOpts,
) {
	const canvasEl = root.querySelector<HTMLCanvasElement>('[data-sheet]');
	const spacerEl = root.querySelector<HTMLElement>('[data-sheet-spacer]');
	if (!canvasEl || !spacerEl) return;
	const canvas = canvasEl;
	const spacer = spacerEl;
	const ctx = canvas.getContext('2d')!;
	const reduce =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

	let els: SheetElement[] = [];
	let marks: SheetMark[] = [];
	let hotspots: SheetHotspot[] = [];
	let W = 0;
	let vh = 0;
	let dpr = 1;
	let grain: HTMLCanvasElement | null = null;
	let raf = 0;
	let built = false;
	let contentH = 0;

	function scrollToMark(id: string, smooth = true) {
		const m = marks.find((mk) => mk.id === id);
		if (!m) return;
		window.scrollTo({
			top: root.offsetTop + m.y - 40,
			behavior: smooth ? 'smooth' : 'auto',
		});
	}

	function hotspotAt(clientX: number, clientY: number): SheetHotspot | null {
		const rect = canvas.getBoundingClientRect();
		const sy = Math.max(0, window.scrollY - root.offsetTop);
		const x = clientX - rect.left;
		const y = clientY - rect.top + sy;
		for (const hs of hotspots) {
			if (x >= hs.x && x <= hs.x + hs.w && y >= hs.y && y <= hs.y + hs.h) return hs;
		}
		return null;
	}

	function buildGrain() {
		const s = 150;
		const c = document.createElement('canvas');
		c.width = c.height = s;
		const g = c.getContext('2d')!;
		const im = g.createImageData(s, s);
		for (let i = 0; i < im.data.length; i += 4) {
			const v = Math.random();
			im.data[i] = im.data[i + 1] = im.data[i + 2] = v > 0.5 ? 255 : 0;
			im.data[i + 3] = (v > 0.985 ? 22 : v < 0.02 ? 34 : 6) * (opts.grainAlpha ?? 1);
		}
		g.putImageData(im, 0, 0);
		return c;
	}

	function size() {
		W = root.clientWidth;
		vh = window.innerHeight;
		dpr = Math.min(devicePixelRatio || 1, 2);
		canvas.width = Math.round(W * dpr);
		canvas.height = Math.round(vh * dpr);
		canvas.style.width = `${W}px`;
		canvas.style.height = `${vh}px`;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	}

	function build() {
		size();
		marks = [];
		hotspots = [];
		const sheet: Sheet = {
			W,
			vh,
			rng: makeRng(opts.seed),
			ground: opts.ground,
			cursor: 0,
			height: 0,
			push(el) {
				el._p = 0;
				els.push(el);
			},
			gap(dy) {
				this.cursor += dy;
			},
			mark(id) {
				marks.push({ id, y: this.cursor });
			},
			hotspot(rect, id) {
				hotspots.push({ ...rect, id });
			},
		};
		els = [];
		compose(sheet);
		contentH = Math.max(sheet.height, sheet.cursor);
		spacer.style.height = `${Math.ceil(contentH)}px`;
		if (!grain) grain = buildGrain();
		built = true;
		// expose scroll targets + a jump helper for the edition index chrome
		(root as any).__editionMarks = marks;
		(root as any).__editionScrollTo = scrollToMark;
		root.dispatchEvent(new CustomEvent('edition:built'));
	}

	function render() {
		if (!built) return;
		const top = root.offsetTop;
		const sy = Math.max(0, window.scrollY - top);

		ctx.fillStyle = opts.ground;
		ctx.fillRect(0, 0, W, vh);

		for (const el of els) {
			const startAt = el.y - (vh - (el.lead ?? vh * 0.28));
			const span = el.reveal ?? vh * 0.6;
			let p = (sy - startAt) / span;
			p = p < 0 ? 0 : p > 1 ? 1 : p;
			// once the element has risen near the top of the viewport it is fully
			// "written" — guarantees nothing stays half-inked after you scroll past.
			// elements in the last stretch of the sheet complete much sooner so
			// there's no dead run-out of blank scroll after the final content.
			const nearEnd = el.y > contentH - vh * 1.3;
			if (sy >= el.y - vh * (nearEnd ? 0.75 : 0.15)) p = 1;
			if (reduce) p = sy + vh > el.y - top ? 1 : 0;
			if (el.latch !== false) el._p = Math.max(el._p ?? 0, p);
			else el._p = p;
			const pp = el._p!;
			if (pp <= 0) continue;
			// cull
			if (el.y + el.h < sy - 40 || el.y > sy + vh + 40) {
				if (pp >= 1) continue; // fully drawn & off-screen — nothing to do
			}
			if (el.y + el.h < sy - vh || el.y > sy + vh * 2) continue;
			ctx.save();
			ctx.translate(0, el.y - sy);
			el.draw(ctx, pp, { W, vh });
			ctx.restore();
		}

		if (grain) {
			ctx.save();
			ctx.globalCompositeOperation = 'overlay';
			const pat = ctx.createPattern(grain, 'repeat');
			if (pat) {
				ctx.fillStyle = pat;
				ctx.fillRect(0, 0, W, vh);
			}
			ctx.restore();
		}
	}

	function onScroll() {
		cancelAnimationFrame(raf);
		raf = requestAnimationFrame(render);
	}

	(async () => {
		await fontsReady();
		build();
		render();
		root.dataset.ready = '';
		window.addEventListener('scroll', onScroll, { passive: true });

		// the drawn contents page is clickable — jump to the article's section
		canvas.addEventListener('click', (e) => {
			const hs = hotspotAt(e.clientX, e.clientY);
			if (hs) scrollToMark(hs.id, !reduce);
		});
		canvas.addEventListener('pointermove', (e) => {
			canvas.style.cursor = hotspotAt(e.clientX, e.clientY) ? 'pointer' : '';
		});

		let rt: number | undefined;
		let lastW = window.innerWidth;
		window.addEventListener('resize', () => {
			if (window.innerWidth === lastW && window.innerHeight === vh) return;
			lastW = window.innerWidth;
			clearTimeout(rt);
			rt = window.setTimeout(() => {
				const keep = new Map(els.map((e, i) => [i, e._p]));
				build();
				els.forEach((e, i) => (e._p = keep.get(i) ?? 0));
				render();
			}, 200);
		});
		onFontsChanged(() => {
			build();
			render();
		});
	})();
}

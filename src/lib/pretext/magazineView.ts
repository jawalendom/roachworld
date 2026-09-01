// Orchestrates the reading experience: parse the article DOM, wait for fonts +
// images, run the typesetter, paint the current page, and handle paging/resize.
// Without JS none of this runs and the semantic HTML is what you read.

import { fontsReady, onFontsChanged } from './fonts';
import { parseArticle } from './parseDom';
import {
	layoutMagazine,
	type Block,
	type EntryHeader,
	type MagazineTheme,
	type PageGeometry,
	type LaidOutPage,
} from './magazine';
import { renderPage, sizeCanvas } from './render';

interface Refs {
	root: HTMLElement;
	source: HTMLElement;
	stage: HTMLElement;
	toggle: HTMLButtonElement;
	nav: HTMLElement;
	counter: HTMLElement;
	prev: HTMLButtonElement;
	next: HTMLButtonElement;
}

export function mountMagazineView(root: HTMLElement) {
	const q = <T extends Element>(sel: string) => root.querySelector(sel) as T;
	const refs: Refs = {
		root,
		source: q('[data-mv-source]'),
		stage: q('[data-mv-stage]'),
		toggle: q('[data-mv-toggle]'),
		nav: q('[data-mv-nav]'),
		counter: q('[data-mv-counter]'),
		prev: q('[data-mv-prev]'),
		next: q('[data-mv-next]'),
	};
	if (!refs.source || !refs.stage || !refs.toggle) return;

	const header: EntryHeader = {
		kicker: root.dataset.kicker || 'JOURNAL',
		title: root.dataset.title || document.title,
		dek: root.dataset.dek || '',
		byline: root.dataset.byline || '',
	};

	let blocks: Block[] | null = null;
	let pages: LaidOutPage[] = [];
	let pageIndex = 0;
	let canvas: HTMLCanvasElement | null = null;
	let building = false;
	let active = false;

	refs.toggle.hidden = false;

	const setMode = (on: boolean) => {
		active = on;
		root.classList.toggle('is-magazine', on);
		refs.toggle.setAttribute('aria-pressed', String(on));
		refs.toggle.textContent = on ? 'Read as text' : 'Read as magazine';
		refs.nav.hidden = !on;
		if (on) build();
	};

	const geometryFor = (w: number): { geom: PageGeometry; theme: MagazineTheme } => {
		const columns = w < 640 ? 1 : w < 1024 ? 2 : 3;
		const pageH = Math.max(560, Math.min(window.innerHeight - 150, w * 1.32));
		const marginX = Math.round(Math.max(20, w * 0.045));
		const gutter = columns === 1 ? 0 : Math.round(Math.max(18, w * 0.028));
		const colW = (w - 2 * marginX - (columns - 1) * gutter) / columns;
		const bodySize = Math.round(Math.min(19, Math.max(14.5, colW / 2.15)));
		const bodyLeading = Math.round(bodySize * 1.5);
		return {
			geom: {
				width: w,
				height: pageH,
				marginX,
				marginTop: Math.round(marginX * 0.9),
				marginBottom: Math.round(marginX * 0.9),
				columns,
				gutter,
			},
			theme: {
				bodySize,
				bodyLeading,
				headingSize: Math.round(bodySize * 1.15),
				headingLeading: Math.round(bodySize * 1.32),
				pullquoteSize: Math.round(bodySize * 1.32),
				pullquoteLeading: Math.round(bodySize * 1.48),
				captionSize: Math.max(10, Math.round(bodySize * 0.72)),
				kickerSize: Math.max(10, Math.round(bodySize * 0.7)),
				dropCapLines: 3,
				paraGap: Math.round(bodyLeading * 0.55),
				paraIndent: bodySize * 1.1,
			},
		};
	};

	async function build() {
		if (building) return;
		building = true;
		refs.stage.setAttribute('data-building', '');
		try {
			// Pull images in eagerly — in magazine mode the prose is clipped, so
			// lazy images would otherwise never load.
			refs.source.querySelectorAll('img').forEach((im) => {
				im.loading = 'eager';
				im.setAttribute('fetchpriority', 'high');
			});

			await fontsReady();
			if (!blocks) blocks = await parseArticle(refs.source);

			const cssW = Math.min(1100, refs.stage.clientWidth || root.clientWidth);
			const { geom, theme } = geometryFor(cssW);
			pages = layoutMagazine(blocks, geom, theme, header);
			pageIndex = Math.max(0, Math.min(pageIndex, pages.length - 1));

			if (!canvas) {
				canvas = document.createElement('canvas');
				canvas.className = 'mv-canvas';
				refs.stage.replaceChildren(canvas);
			}
			const ctx = sizeCanvas(canvas, geom.width, geom.height);
			renderPage(ctx, pages[pageIndex]);
			updateNav();
		} catch (err) {
			console.error('[magazine-view] build failed', err);
			// Fall back to prose so the reader isn't stranded on a blank stage.
			setMode(false);
		} finally {
			building = false;
			refs.stage.removeAttribute('data-building');
		}
	}

	function paint() {
		if (!canvas || !pages[pageIndex]) return;
		const ctx = canvas.getContext('2d')!;
		renderPage(ctx, pages[pageIndex]);
		updateNav();
	}

	function updateNav() {
		refs.counter.textContent = `${pageIndex + 1} / ${pages.length}`;
		refs.prev.disabled = pageIndex === 0;
		refs.next.disabled = pageIndex >= pages.length - 1;
	}

	const go = (delta: number) => {
		const n = Math.min(pages.length - 1, Math.max(0, pageIndex + delta));
		if (n !== pageIndex) {
			pageIndex = n;
			paint();
			refs.stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	};

	refs.toggle.addEventListener('click', () => setMode(!active));
	refs.prev.addEventListener('click', () => go(-1));
	refs.next.addEventListener('click', () => go(1));

	window.addEventListener('keydown', (e) => {
		if (!active) return;
		if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1);
		else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1);
		else if (e.key === 'Escape') setMode(false);
	});

	// swipe
	let tx = 0;
	refs.stage.addEventListener(
		'touchstart',
		(e) => (tx = e.changedTouches[0].clientX),
		{ passive: true },
	);
	refs.stage.addEventListener(
		'touchend',
		(e) => {
			const dx = e.changedTouches[0].clientX - tx;
			if (Math.abs(dx) > 48) go(dx < 0 ? 1 : -1);
		},
		{ passive: true },
	);

	let rt: number | undefined;
	const ro = new ResizeObserver(() => {
		if (!active) return;
		clearTimeout(rt);
		rt = window.setTimeout(build, 180);
	});
	ro.observe(refs.stage);

	onFontsChanged(() => {
		if (active) build();
	});

	// Deep-link: #magazine opens straight into it.
	if (location.hash === '#magazine') setMode(true);
}

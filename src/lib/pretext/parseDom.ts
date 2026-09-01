// Turn rendered article HTML into the block list the typesetter consumes.
// The HTML stays the source of truth (and the accessible version); this is
// only a projection of it.

import type { Block } from './magazine';

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export async function parseArticle(container: HTMLElement): Promise<Block[]> {
	const blocks: Block[] = [];
	const figures: { block: Extract<Block, { type: 'figure' }>; img: HTMLImageElement }[] = [];

	for (const node of Array.from(container.children)) {
		const el = node as HTMLElement;
		switch (el.tagName) {
			case 'P': {
				const t = clean(el.textContent);
				if (t) blocks.push({ type: 'para', text: t });
				break;
			}
			case 'H2':
			case 'H3':
			case 'H4': {
				const t = clean(el.textContent);
				if (t) blocks.push({ type: 'heading', text: t });
				break;
			}
			case 'HR':
				blocks.push({ type: 'rule' });
				break;
			case 'BLOCKQUOTE': {
				const cite = el.querySelector('cite');
				const attribution = cite ? clean(cite.textContent) : undefined;
				if (cite) cite.remove();
				const text = clean(el.textContent);
				if (text) blocks.push({ type: 'pullquote', text, attribution });
				break;
			}
			case 'UL':
			case 'OL': {
				for (const li of Array.from(el.querySelectorAll(':scope > li'))) {
					const t = clean(li.textContent);
					if (t) blocks.push({ type: 'para', text: `— ${t}` });
				}
				break;
			}
			case 'FIGURE':
			case 'IMG': {
				const img = (el.tagName === 'IMG' ? el : el.querySelector('img')) as HTMLImageElement | null;
				if (!img) break;
				const figcap = el.tagName === 'FIGURE' ? el.querySelector('figcaption') : null;
				const caption = figcap ? clean(figcap.textContent) : undefined;
				const raw =
					el.getAttribute('data-span') ||
					(el.classList.contains('wide') && 'wide') ||
					(el.classList.contains('inset') && 'inset') ||
					'column';
				const span = (['inset', 'column', 'wide'].includes(raw as string) ? raw : 'column') as
					| 'inset'
					| 'column'
					| 'wide';
				const block: Extract<Block, { type: 'figure' }> = {
					type: 'figure',
					img,
					naturalW: 1200,
					naturalH: 800,
					caption,
					span,
				};
				blocks.push(block);
				figures.push({ block, img });
				break;
			}
		}
	}

	await Promise.all(
		figures.map(async ({ block, img }) => {
			await settleImage(img, 2500);
			if (img.naturalWidth > 0) {
				block.naturalW = img.naturalWidth;
				block.naturalH = img.naturalHeight;
			}
			// else: keep the 3:2 default so layout can still proceed.
		}),
	);

	return blocks;
}

// Resolve once the image has loaded, errored, or the deadline passes — never hang.
function settleImage(img: HTMLImageElement, timeoutMs: number): Promise<void> {
	if (img.complete) return Promise.resolve(); // loaded OR errored
	return new Promise<void>((res) => {
		const done = () => {
			clearTimeout(t);
			img.removeEventListener('load', done);
			img.removeEventListener('error', done);
			res();
		};
		const t = setTimeout(done, timeoutMs);
		img.addEventListener('load', done, { once: true });
		img.addEventListener('error', done, { once: true });
		if (typeof img.decode === 'function') img.decode().then(done, () => {});
	});
}

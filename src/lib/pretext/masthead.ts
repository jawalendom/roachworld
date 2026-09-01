// The cover wordmark. pretext measures the natural single-line width of the
// title at a reference size; we scale that to fill the available width exactly,
// then stamp it three times — blue, pink, black — out of register.

import { prepareWithSegments, measureNaturalWidth } from '@chenglou/pretext';
import { createPage, compositePage } from './riso';
import { FONT } from './fonts';
import { INK } from '../../consts';

export interface MastheadOptions {
	text: string;
	width: number;
	height: number;
	/** Fraction of width the wordmark should occupy. */
	fill?: number;
	subtitle?: string;
}

export function renderMasthead(target: CanvasRenderingContext2D, opts: MastheadOptions) {
	const { text, width, height, fill = 0.9, subtitle } = opts;
	const REF = 100;
	const prepared = prepareWithSegments(text, FONT.display(REF), { letterSpacing: -2 });
	const naturalW = measureNaturalWidth(prepared);
	const targetW = width * fill;
	let size = (targetW / naturalW) * REF;
	size = Math.min(size, height * 0.54);

	const page = createPage(width, height);
	const cx = width / 2;
	const baseline = height * 0.62;

	const stamps: Array<[keyof typeof INK, number, number]> = [
		['blue', -5, 3],
		['pink', 4, -2],
		['black', 0, 0],
	];
	for (const [ink, dx, dy] of stamps) {
		const ctx = page.layers[ink as 'blue' | 'pink' | 'black'].ctx;
		ctx.font = FONT.display(size);
		ctx.textAlign = 'center';
		try {
			(ctx as any).letterSpacing = `${-size * 0.02}px`;
		} catch {}
		ctx.fillStyle = INK[ink];
		ctx.fillText(text, cx + dx, baseline + dy);
	}

	if (subtitle) {
		const sctx = page.layers.black.ctx;
		sctx.font = FONT.kicker(Math.max(11, size * 0.07));
		sctx.textAlign = 'center';
		try {
			(sctx as any).letterSpacing = '4px';
		} catch {}
		sctx.fillStyle = INK.black;
		sctx.fillText(subtitle.toUpperCase(), cx, baseline + size * 0.28);
	}

	// register bars, top-left — a nod to a real print sheet
	for (const [ink, i] of [
		['blue', 0],
		['pink', 1],
		['black', 2],
	] as const) {
		const c = page.layers[ink as 'blue' | 'pink' | 'black'].ctx;
		c.fillStyle = INK[ink];
		c.fillRect(14 + i * 10, 14, 6, 22);
		c.fillRect(14, 14 + i * 8, 22, 4);
	}

	compositePage(target, page);
}

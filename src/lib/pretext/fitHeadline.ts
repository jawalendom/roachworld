// Pick the largest font size at which `text` still fits within `maxLines` lines
// at `maxWidth`. pretext's `layout()` returns `lineCount` for a prepared string
// cheaply, so we can binary-search size without ever touching the DOM.

import { prepare, layout } from '@chenglou/pretext';

export interface FitOptions {
	maxWidth: number;
	maxLines: number;
	minSize?: number;
	maxSize?: number;
	lineHeightRatio?: number; // line-height as a multiple of font size
	/** Build the CSS `font` shorthand for a given pixel size. */
	font: (px: number) => string;
	letterSpacing?: number;
}

export interface FitResult {
	fontSize: number;
	lineHeight: number;
	lineCount: number;
	height: number;
}

export function fitText(text: string, opts: FitOptions): FitResult {
	const {
		maxWidth,
		maxLines,
		minSize = 12,
		maxSize = 240,
		lineHeightRatio = 1.02,
		font,
		letterSpacing = 0,
	} = opts;

	const fits = (size: number) => {
		const prepared = prepare(text, font(size), { letterSpacing });
		const lh = size * lineHeightRatio;
		const { lineCount } = layout(prepared, maxWidth, lh);
		return lineCount <= maxLines;
	};

	let lo = minSize;
	let hi = maxSize;
	// 7 iterations over a 12–240px range lands within ~2px.
	for (let i = 0; i < 8; i++) {
		const mid = (lo + hi) / 2;
		if (fits(mid)) lo = mid;
		else hi = mid;
	}

	const fontSize = Math.floor(lo);
	const lineHeight = fontSize * lineHeightRatio;
	const prepared = prepare(text, font(fontSize), { letterSpacing });
	const { lineCount, height } = layout(prepared, maxWidth, lineHeight);
	return { fontSize, lineHeight, lineCount, height };
}

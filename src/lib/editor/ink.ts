// Text as ink. pretext lays the lines out (variable-width capable); we reveal
// them character by character so the words "write on" as you scroll.

import {
	prepareWithSegments,
	layoutNextLineRange,
	materializeLineRange,
	measureNaturalWidth,
	type LayoutCursor,
} from '@chenglou/pretext';

export interface InkLine {
	text: string;
	x: number;
	y: number; // baseline
	chars: number;
}

export interface InkBlock {
	lines: InkLine[];
	width: number;
	height: number;
	totalChars: number;
}

/** Flow `text` into lines at `maxWidth`, left-aligned from (x, y). */
export function layoutInk(
	text: string,
	font: string,
	maxWidth: number,
	lineHeight: number,
	x = 0,
	y = 0,
	opts: { letterSpacing?: number; align?: 'left' | 'center' } = {},
): InkBlock {
	const prepared = prepareWithSegments(text, font, { letterSpacing: opts.letterSpacing ?? 0 });
	let cur: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
	const lines: InkLine[] = [];
	let cy = y;
	let widest = 0;
	while (lines.length < 400) {
		const range = layoutNextLineRange(prepared, cur, maxWidth);
		if (!range) break;
		const line = materializeLineRange(prepared, range);
		widest = Math.max(widest, line.width);
		lines.push({ text: line.text, x, y: cy, chars: [...line.text].length });
		cur = range.end;
		cy += lineHeight;
	}
	if (opts.align === 'center') {
		for (const l of lines) l.x = x + (maxWidth - measureLineWidth(l.text, font, opts.letterSpacing ?? 0)) / 2;
	}
	return {
		lines,
		width: widest,
		height: cy - y,
		totalChars: lines.reduce((s, l) => s + l.chars, 0),
	};
}

function measureLineWidth(text: string, font: string, ls: number) {
	return measureNaturalWidth(prepareWithSegments(text, font, { letterSpacing: ls }));
}

/** Draw an InkBlock up to `progress` of its characters. */
export function drawInk(
	ctx: CanvasRenderingContext2D,
	block: InkBlock,
	progress: number,
	style: { font: string; color: string; alpha?: number; letterSpacing?: number },
) {
	if (progress <= 0) return;
	const budgetTotal = progress * block.totalChars;
	let used = 0;
	ctx.save();
	ctx.font = style.font;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = style.color;
	ctx.globalAlpha = style.alpha ?? 1;
	if (style.letterSpacing != null) {
		try {
			(ctx as any).letterSpacing = `${style.letterSpacing}px`;
		} catch {}
	}
	for (const line of block.lines) {
		if (used >= budgetTotal) break;
		const remaining = budgetTotal - used;
		if (remaining >= line.chars) {
			ctx.fillText(line.text, line.x, line.y);
		} else {
			const n = Math.max(0, Math.floor(remaining));
			ctx.fillText([...line.text].slice(0, n).join(''), line.x, line.y);
		}
		used += line.chars;
	}
	try {
		(ctx as any).letterSpacing = '0px';
	} catch {}
	ctx.restore();
}

/** Largest font px at which `text` fits in `maxLines` lines within `maxWidth`.
 *  Uses the same line-breaker as `layoutInk` (which hard-breaks over-long words),
 *  and rejects any size whose longest line overflows `maxWidth` — so a single
 *  unbreakable word like "FLUORESCENCE" is shrunk to fit rather than chopped. */
export function fitInk(
	text: string,
	fontOf: (px: number) => string,
	maxWidth: number,
	maxLines: number,
	bounds: [number, number] = [16, 200],
	lhRatio = 1.0,
): number {
	let [lo, hi] = bounds;
	const words = text.split(/\s+/).filter(Boolean);
	const fits = (px: number) => {
		// no individual word may be wider than the column (that would force an
		// ugly mid-word hard break), then the line count must be within budget.
		const font = fontOf(px);
		for (const word of words) {
			const wb = layoutInk(word, font, 1e6, px);
			if (wb.width > maxWidth + 1) return false;
		}
		const b = layoutInk(text, font, maxWidth, px * lhRatio);
		return b.lines.length <= maxLines;
	};
	for (let i = 0; i < 9; i++) {
		const mid = (lo + hi) / 2;
		if (fits(mid)) lo = mid;
		else hi = mid;
	}
	return Math.max(bounds[0], Math.floor(lo));
}

export { measureNaturalWidth, prepareWithSegments };

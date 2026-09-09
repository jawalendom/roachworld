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
export interface DrawInkStyle {
	font: string;
	color: string;
	alpha?: number;
	letterSpacing?: number;
	/** RGB channel-split offset in px (fades as progress → 1). */
	split?: number;
	/** colours for the two split channels [under, over]. */
	splitColors?: [string, string];
	/** per-line vertical jitter in px (fades as progress → 1). */
	jitter?: number;
	/** show a few scrambled glyphs at the decoding edge + a block cursor. */
	scramble?: boolean;
}

const CURSOR = '█';
const NOISE = '01<>/\\[]{}#%*+=~|:.';
const jy = (v: number) => {
	const x = Math.sin(v * 91.7 + 3.3) * 43758.5453;
	return x - Math.floor(x); // [0, 1)
};

function paintPass(
	ctx: CanvasRenderingContext2D,
	block: InkBlock,
	progress: number,
	style: DrawInkStyle,
	ox: number,
	oy: number,
	scramble: boolean,
) {
	const budgetTotal = progress * block.totalChars;
	let used = 0;
	const jit = style.jitter ? style.jitter * (1 - progress) : 0;
	for (const line of block.lines) {
		if (used >= budgetTotal && progress < 1) break;
		const remaining = budgetTotal - used;
		const dy = jit ? (jy(line.y) - 0.5) * 2 * jit : 0;
		let text: string;
		if (remaining >= line.chars) {
			text = line.text;
		} else {
			const n = Math.max(0, Math.floor(remaining));
			text = [...line.text].slice(0, n).join('');
			if (scramble && n < line.chars) {
				let g = '';
				for (let i = 0; i < Math.min(3, line.chars - n); i++) g += NOISE[(Math.random() * NOISE.length) | 0];
				text += g + CURSOR;
			}
		}
		ctx.fillText(text, line.x + ox, line.y + oy + dy);
		used += line.chars;
	}
}

export function drawInk(
	ctx: CanvasRenderingContext2D,
	block: InkBlock,
	progress: number,
	style: DrawInkStyle,
) {
	if (progress <= 0) return;
	ctx.save();
	ctx.font = style.font;
	ctx.textAlign = 'left';
	ctx.textBaseline = 'alphabetic';
	if (style.letterSpacing != null) {
		try {
			(ctx as any).letterSpacing = `${style.letterSpacing}px`;
		} catch {}
	}

	const scramble = !!style.scramble && progress < 1;
	const split = style.split ? style.split * (0.3 + (1 - progress) * 1.7) : 0;
	if (split > 0.4) {
		const [c1, c2] = style.splitColors ?? ['#ff2e4d', '#12e8ff'];
		ctx.save();
		ctx.globalCompositeOperation = 'lighter';
		ctx.globalAlpha = (style.alpha ?? 1) * 0.55;
		ctx.fillStyle = c1;
		paintPass(ctx, block, progress, style, -split, split * 0.35, scramble);
		ctx.fillStyle = c2;
		paintPass(ctx, block, progress, style, split, -split * 0.35, scramble);
		ctx.restore();
	}

	ctx.fillStyle = style.color;
	ctx.globalAlpha = style.alpha ?? 1;
	paintPass(ctx, block, progress, style, 0, 0, scramble);

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

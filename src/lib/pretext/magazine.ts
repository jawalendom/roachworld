// The typesetter. Takes an ordered list of content blocks and flows them
// through a multi-column, paginated page — the way a magazine is set, not the
// way a browser stacks divs.
//
// pretext does the hard part: `layoutNextLineRange` walks a prepared paragraph
// one line at a time and accepts a DIFFERENT max-width on every call. That's
// what lets body text narrow around a drop cap, a pull-quote, or an inset
// figure and then widen again once past it.

import {
	prepareWithSegments,
	layoutNextLineRange,
	materializeLineRange,
	measureNaturalWidth,
	type LayoutCursor,
} from '@chenglou/pretext';
import { FONT } from './fonts';
import type { InkName } from '../../consts';

// ── Public input types ──────────────────────────────────────────────────────
export type Block =
	| { type: 'para'; text: string }
	| { type: 'heading'; text: string }
	| { type: 'pullquote'; text: string; attribution?: string }
	| {
			type: 'figure';
			img: CanvasImageSource;
			naturalW: number;
			naturalH: number;
			caption?: string;
			span: 'inset' | 'column' | 'wide';
	  }
	| { type: 'rule' };

export interface EntryHeader {
	kicker: string;
	title: string;
	dek: string;
	byline: string;
}

export interface PageGeometry {
	width: number;
	height: number;
	marginX: number;
	marginTop: number;
	marginBottom: number;
	columns: number;
	gutter: number;
}

export interface MagazineTheme {
	bodySize: number;
	bodyLeading: number;
	headingSize: number;
	headingLeading: number;
	pullquoteSize: number;
	pullquoteLeading: number;
	captionSize: number;
	kickerSize: number;
	dropCapLines: number;
	paraGap: number;
	paraIndent: number;
}

// ── Output: flat draw ops, ready for a 2D context ───────────────────────────
export type DrawOp =
	| {
			kind: 'text';
			x: number;
			y: number; // alphabetic baseline
			text: string;
			font: string;
			ink: InkName;
			letterSpacing?: number;
	  }
	| { kind: 'image'; x: number; y: number; w: number; h: number; img: CanvasImageSource; ink: InkName }
	| { kind: 'rect'; x: number; y: number; w: number; h: number; ink: InkName }
	| { kind: 'line'; x1: number; y1: number; x2: number; y2: number; ink: InkName; width: number };

export interface LaidOutPage {
	ops: DrawOp[];
	width: number;
	height: number;
}

// ── Internals ───────────────────────────────────────────────────────────────
interface Intrusion {
	col: number;
	side: 'left' | 'right';
	x: number;
	w: number;
	top: number;
	bottom: number;
}

const BASELINE = 0.8; // baseline as a fraction of font size below the pen line
const MIN_LINE = 52; // don't try to set body text narrower than this

// Wrap a short run (caption, heading) to a width and return its lines.
function wrapLines(text: string, font: string, maxWidth: number): string[] {
	const prepared = prepareWithSegments(text, font);
	let cur: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
	const out: string[] = [];
	while (out.length < 200) {
		const range = layoutNextLineRange(prepared, cur, Math.max(24, maxWidth));
		if (!range) break;
		out.push(materializeLineRange(prepared, range).text);
		cur = range.end;
	}
	return out;
}

export function layoutMagazine(
	blocks: Block[],
	geom: PageGeometry,
	theme: MagazineTheme,
	header?: EntryHeader,
): LaidOutPage[] {
	const colWidth =
		(geom.width - 2 * geom.marginX - (geom.columns - 1) * geom.gutter) / geom.columns;
	const colX = (col: number) => geom.marginX + col * (colWidth + geom.gutter);
	const textLeft = geom.marginX;
	const textRight = geom.width - geom.marginX;
	const colBottom = geom.height - geom.marginBottom;

	const pages: DrawOp[][] = [[]];
	const pageTop: number[] = [geom.marginTop];
	const intrusions: Intrusion[][] = [[]];

	let page = 0;
	let col = 0;
	let y = geom.marginTop;
	let pulls = 0; // alternates pull-quote / inset side

	const ensurePage = (p: number) => {
		while (pages.length <= p) {
			pages.push([]);
			pageTop.push(geom.marginTop);
			intrusions.push([]);
		}
	};
	const nextColumn = () => {
		col++;
		if (col >= geom.columns) {
			page++;
			col = 0;
			ensurePage(page);
		}
		y = pageTop[page];
	};

	// Horizontal slot available for a line in [bandTop, bandBot] of the current column.
	const slot = (bandTop: number, bandBot: number) => {
		let left = colX(col);
		let right = colX(col) + colWidth;
		let blockedUntil = 0;
		for (const it of intrusions[page]) {
			if (it.col !== col) continue;
			if (bandBot <= it.top || bandTop >= it.bottom) continue;
			if (it.side === 'left') left = Math.max(left, it.x + it.w);
			else right = Math.min(right, it.x);
			blockedUntil = Math.max(blockedUntil, it.bottom);
		}
		return { x: left, w: right - left, blockedUntil };
	};

	// ── Page-1 header ─────────────────────────────────────────────────────────
	if (header) {
		const ops = pages[0];
		ops.push({
			kind: 'text',
			x: textLeft,
			y: y + theme.kickerSize * BASELINE,
			text: header.kicker.toUpperCase(),
			font: FONT.kicker(theme.kickerSize),
			ink: 'blue',
			letterSpacing: 3,
		});
		y += theme.kickerSize * 1.8;

		const titleWidth = textRight - textLeft;
		const titlePrepared = prepareWithSegments(header.title, FONT.display(theme.headingSize * 1.7));
		let tcur: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
		const titleLeading = theme.headingSize * 1.7 * 1.02;
		while (true) {
			const range = layoutNextLineRange(titlePrepared, tcur, titleWidth);
			if (!range) break;
			const line = materializeLineRange(titlePrepared, range);
			ops.push({
				kind: 'text',
				x: textLeft,
				y: y + theme.headingSize * 1.7 * BASELINE,
				text: line.text,
				font: FONT.display(theme.headingSize * 1.7),
				ink: 'pink',
			});
			tcur = range.end;
			y += titleLeading;
		}
		y += theme.bodyLeading * 0.5;

		const dekPrepared = prepareWithSegments(header.dek, FONT.body(theme.bodySize * 1.15));
		let dcur: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
		const dekWidth = Math.min(titleWidth, colWidth * 2 + geom.gutter);
		while (true) {
			const range = layoutNextLineRange(dekPrepared, dcur, dekWidth);
			if (!range) break;
			const line = materializeLineRange(dekPrepared, range);
			ops.push({
				kind: 'text',
				x: textLeft,
				y: y + theme.bodySize * 1.15 * BASELINE,
				text: line.text,
				font: FONT.body(theme.bodySize * 1.15),
				ink: 'black',
			});
			dcur = range.end;
			y += theme.bodySize * 1.15 * 1.35;
		}
		y += theme.bodyLeading * 0.4;
		ops.push({
			kind: 'text',
			x: textLeft,
			y: y + theme.kickerSize * BASELINE,
			text: `BY ${header.byline.toUpperCase()}`,
			font: FONT.kicker(theme.kickerSize),
			ink: 'black',
			letterSpacing: 2,
		});
		y += theme.kickerSize * 1.6;
		ops.push({
			kind: 'line',
			x1: textLeft,
			y1: y,
			x2: textRight,
			y2: y,
			ink: 'pink',
			width: 3,
		});
		y += theme.bodyLeading;
		pageTop[0] = y; // columns on page 1 begin below the header
	}

	// ── Flow the blocks ──────────────────────────────────────────────────────
	let firstPara = true;
	let afterHeading = false;

	for (const block of blocks) {
		if (block.type === 'rule') {
			if (y + theme.bodyLeading > colBottom) nextColumn();
			const cx = colX(col);
			pages[page].push({
				kind: 'line',
				x1: cx,
				y1: y + theme.bodyLeading * 0.4,
				x2: cx + colWidth,
				y2: y + theme.bodyLeading * 0.4,
				ink: 'blue',
				width: 2,
			});
			y += theme.bodyLeading;
			afterHeading = false;
			continue;
		}

		if (block.type === 'heading') {
			const need = theme.headingLeading * 2 + theme.bodyLeading;
			if (y + need > colBottom) nextColumn();
			else if (y > pageTop[page]) y += theme.paraGap * 1.4;
			const prepared = prepareWithSegments(block.text.toUpperCase(), FONT.heading(theme.headingSize));
			let cur: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
			while (true) {
				const range = layoutNextLineRange(prepared, cur, colWidth);
				if (!range) break;
				const line = materializeLineRange(prepared, range);
				pages[page].push({
					kind: 'text',
					x: colX(col),
					y: y + theme.headingSize * BASELINE,
					text: line.text,
					font: FONT.heading(theme.headingSize),
					ink: 'pink',
					letterSpacing: 0.5,
				});
				cur = range.end;
				y += theme.headingLeading;
			}
			y += theme.bodyLeading * 0.35;
			afterHeading = true;
			firstPara = false;
			continue;
		}

		if (block.type === 'pullquote') {
			// Full-column block: rules top and bottom, big display type, body
			// resumes underneath. (Floating a quote inside a ~300px column leaves
			// too little room for readable body text beside it.)
			const lines = wrapLines(block.text, FONT.pullquote(theme.pullquoteSize), colWidth);
			const attrH = block.attribution ? theme.captionSize * 1.8 : 0;
			const boxH =
				theme.pullquoteSize * 0.9 +
				lines.length * theme.pullquoteLeading +
				attrH +
				theme.pullquoteSize * 0.9;
			if (y > pageTop[page] && y + boxH > colBottom) nextColumn();

			const cx0 = colX(col);
			let qy = y + theme.pullquoteSize * 0.5;
			pages[page].push({
				kind: 'line',
				x1: cx0,
				y1: qy,
				x2: cx0 + colWidth,
				y2: qy,
				ink: 'blue',
				width: 3,
			});
			qy += theme.pullquoteSize * 0.55;
			for (const l of lines) {
				pages[page].push({
					kind: 'text',
					x: cx0,
					y: qy + theme.pullquoteSize * BASELINE,
					text: l,
					font: FONT.pullquote(theme.pullquoteSize),
					ink: 'blue',
				});
				qy += theme.pullquoteLeading;
			}
			if (block.attribution) {
				qy += theme.captionSize * 0.4;
				pages[page].push({
					kind: 'text',
					x: cx0,
					y: qy + theme.captionSize * BASELINE,
					text: `— ${block.attribution}`,
					font: FONT.caption(theme.captionSize),
					ink: 'black',
				});
				qy += theme.captionSize * 1.4;
			}
			qy += theme.pullquoteSize * 0.35;
			pages[page].push({
				kind: 'line',
				x1: cx0,
				y1: qy,
				x2: cx0 + colWidth,
				y2: qy,
				ink: 'blue',
				width: 3,
			});
			y = qy + theme.paraGap;
			afterHeading = false;
			continue;
		}

		if (block.type === 'figure') {
			const aspect = block.naturalH / block.naturalW;
			if (block.span === 'wide') {
				// Banner at the top of a fresh page.
				if (pages[page].length > (page === 0 ? 0 : 0) && (col > 0 || y > pageTop[page])) {
					page++;
					col = 0;
					ensurePage(page);
				}
				const w = textRight - textLeft;
				const h = Math.min(w * aspect, geom.height * 0.42);
				pages[page].push({ kind: 'image', x: textLeft, y: geom.marginTop, w, h, img: block.img, ink: 'black' });
				let capBottom = geom.marginTop + h;
				if (block.caption) {
					capBottom += theme.captionSize * 0.5;
					for (const cl of wrapLines(block.caption, FONT.caption(theme.captionSize), w)) {
						pages[page].push({
							kind: 'text',
							x: textLeft,
							y: capBottom + theme.captionSize * BASELINE,
							text: cl,
							font: FONT.caption(theme.captionSize),
							ink: 'blue',
						});
						capBottom += theme.captionSize * 1.35;
					}
				}
				pageTop[page] = capBottom + theme.bodyLeading;
				y = pageTop[page];
				afterHeading = false;
				continue;
			}

			const insetW = colWidth * 0.5;
			const canFloat = colWidth - insetW - theme.bodySize >= 120;
			const span = block.span === 'inset' && !canFloat ? 'column' : block.span;
			const w = span === 'inset' ? insetW : colWidth;
			const h = w * aspect;
			const capH = block.caption ? theme.captionSize * 1.8 : 0;

			if (span === 'column') {
				if (y + h + capH > colBottom) nextColumn();
				pages[page].push({ kind: 'image', x: colX(col), y, w, h, img: block.img, ink: 'black' });
				y += h + theme.captionSize * 0.5;
				if (block.caption) {
					for (const cl of wrapLines(block.caption, FONT.caption(theme.captionSize), w)) {
						pages[page].push({
							kind: 'text',
							x: colX(col),
							y: y + theme.captionSize * BASELINE,
							text: cl,
							font: FONT.caption(theme.captionSize),
							ink: 'blue',
						});
						y += theme.captionSize * 1.35;
					}
				}
				y += theme.paraGap;
			} else {
				// inset — float it, wrap body around.
				const side: 'left' | 'right' = pulls++ % 2 === 0 ? 'left' : 'right';
				if (y + theme.bodyLeading * 2 > colBottom) nextColumn();
				const bx = side === 'left' ? colX(col) : colX(col) + colWidth - w;
				pages[page].push({ kind: 'image', x: bx, y, w, h, img: block.img, ink: 'black' });
				let ib = y + h + theme.captionSize * 0.5;
				if (block.caption) {
					for (const cl of wrapLines(block.caption, FONT.caption(theme.captionSize), w)) {
						pages[page].push({
							kind: 'text',
							x: bx,
							y: ib + theme.captionSize * BASELINE,
							text: cl,
							font: FONT.caption(theme.captionSize),
							ink: 'blue',
						});
						ib += theme.captionSize * 1.35;
					}
				}
				intrusions[page].push({
					col,
					side,
					x: bx,
					w: w + theme.bodySize,
					top: y,
					bottom: ib + theme.bodyLeading * 0.5,
				});
			}
			afterHeading = false;
			continue;
		}

		// ── Paragraph ────────────────────────────────────────────────────────
		let text = block.text;
		const useDropCap = firstPara && !afterHeading;
		let capOp: DrawOp | null = null;
		let capRight = 0;

		if (useDropCap && text.length > 0) {
			const capChar = [...text][0];
			text = text.slice(capChar.length).replace(/^\s+/, '');
			// Cap height ≈ 0.72em; size it so the glyph spans (dropCapLines − ~0.3)
			// lines, leaving air before the first full-width line.
			const capSize = ((theme.dropCapLines - 0.35) * theme.bodyLeading) / 0.72;
			const capPrepared = prepareWithSegments(capChar, FONT.dropCap(capSize));
			const capW = measureNaturalWidth(capPrepared);
			capRight = capW + theme.bodySize * 0.55;
			if (y + theme.bodyLeading > colBottom) nextColumn();
			capOp = {
				kind: 'text',
				x: colX(col),
				y: y + capSize * 0.72,
				text: capChar,
				font: FONT.dropCap(capSize),
				ink: 'pink',
			};
			intrusions[page].push({
				col,
				side: 'left',
				x: colX(col),
				w: capRight,
				top: y,
				bottom: y + theme.dropCapLines * theme.bodyLeading,
			});
			pages[page].push(capOp);
		}

		const prepared = prepareWithSegments(text, FONT.body(theme.bodySize));
		let cur: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
		let lineIndex = 0;

		while (true) {
			const bandTop = y;
			const bandBot = y + theme.bodyLeading;
			if (bandBot > colBottom) {
				nextColumn();
				continue;
			}
			const s = slot(bandTop, bandBot);
			let indent = 0;
			if (lineIndex === 0 && !useDropCap && !afterHeading && !firstPara) indent = theme.paraIndent;

			if (s.w - indent < MIN_LINE) {
				// Not enough room on this line — drop past whatever is blocking it.
				y = s.blockedUntil > y ? s.blockedUntil : y + theme.bodyLeading;
				continue;
			}

			const range = layoutNextLineRange(prepared, cur, s.w - indent);
			if (!range) break;
			const line = materializeLineRange(prepared, range);
			pages[page].push({
				kind: 'text',
				x: s.x + indent,
				y: y + theme.bodySize * BASELINE,
				text: line.text,
				font: FONT.body(theme.bodySize),
				ink: 'black',
			});
			cur = range.end;
			y += theme.bodyLeading;
			lineIndex++;
		}

		y += theme.paraGap;
		firstPara = false;
		afterHeading = false;
	}

	return pages.map((ops, i) => ({ ops, width: geom.width, height: pageTop[i] === undefined ? geom.height : geom.height }));
}

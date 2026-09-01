// Paint a laid-out page onto a risograph page (per-ink layers), then composite.

import { createPage, compositePage, drawDuotone, type RisoLayer } from './riso';
import type { LaidOutPage } from './magazine';
import { INK, type InkName } from '../../consts';

export function renderPage(target: CanvasRenderingContext2D, laid: LaidOutPage) {
	const page = createPage(laid.width, laid.height);

	for (const op of laid.ops) {
		const layer = page.layers[op.ink as Exclude<InkName, 'paper'>] as RisoLayer;
		if (!layer) continue;
		const { ctx } = layer;
		ctx.fillStyle = INK[op.ink];
		ctx.strokeStyle = INK[op.ink];

		switch (op.kind) {
			case 'text': {
				ctx.font = op.font;
				if (op.letterSpacing) {
					// canvas letterSpacing is widely supported now; guard anyway.
					try {
						(ctx as any).letterSpacing = `${op.letterSpacing}px`;
					} catch {}
				}
				ctx.fillText(op.text, op.x, op.y);
				try {
					(ctx as any).letterSpacing = '0px';
				} catch {}
				break;
			}
			case 'line': {
				ctx.lineWidth = op.width;
				ctx.beginPath();
				ctx.moveTo(op.x1, op.y1);
				ctx.lineTo(op.x2, op.y2);
				ctx.stroke();
				break;
			}
			case 'rect': {
				ctx.fillRect(op.x, op.y, op.w, op.h);
				break;
			}
			case 'image': {
				drawDuotone(layer, op.img, op.x, op.y, op.w, op.h);
				// hairline keyline
				const kl = page.layers.blue.ctx;
				kl.strokeStyle = INK.blue;
				kl.lineWidth = 1.5;
				kl.strokeRect(op.x, op.y, op.w, op.h);
				break;
			}
		}
	}

	compositePage(target, page);
}

export function sizeCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number) {
	const dpr = Math.min(devicePixelRatio || 1, 2);
	canvas.width = Math.round(cssW * dpr);
	canvas.height = Math.round(cssH * dpr);
	canvas.style.width = `${cssW}px`;
	canvas.style.height = `${cssH}px`;
	const ctx = canvas.getContext('2d')!;
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	return ctx;
}

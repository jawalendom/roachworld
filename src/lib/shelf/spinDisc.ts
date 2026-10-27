// A single CD spinning flat, its label reading the piece's title — the shelf's
// teaser on the issue page. The printed disc is drawn once (art.ts) and turned
// with `drawImage`; a fixed sheen on top sells the mirror as it spins.

import { discArt } from './art';

export interface SpinDisc {
	/** draw the disc centred at (cx, cy), `r` px radius, at time `t` seconds */
	draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, t: number, alpha?: number): void;
}

export function makeSpinDisc(title: string, color = '#00ff9c'): SpinDisc {
	const art = discArt({ title, artist: 'Roachworld', color, tracks: [] }, 6);
	return {
		draw(ctx, cx, cy, r, t, alpha = 1) {
			ctx.save();
			ctx.globalAlpha = alpha;
			// soft glow under the disc
			const glow = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 1.35);
			glow.addColorStop(0, 'rgba(0,255,156,0.12)');
			glow.addColorStop(1, 'rgba(0,255,156,0)');
			ctx.fillStyle = glow;
			ctx.fillRect(cx - r * 1.4, cy - r * 1.4, r * 2.8, r * 2.8);
			// the printed disc, turning
			ctx.save();
			ctx.translate(cx, cy);
			ctx.rotate(t * 1.6);
			ctx.beginPath();
			ctx.arc(0, 0, r, 0, Math.PI * 2);
			ctx.clip();
			ctx.drawImage(art, -r, -r, r * 2, r * 2);
			ctx.restore();
			// fixed sheen: two light wedges across the mirror, like a real CD
			ctx.save();
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
			ctx.arc(cx, cy, r * 0.12, 0, Math.PI * 2, true);
			ctx.clip('evenodd');
			ctx.globalCompositeOperation = 'lighter';
			for (const [a0, col] of [[-0.9, 'rgba(19,232,255,0.22)'], [2.25, 'rgba(255,46,77,0.16)']] as const) {
				const g = ctx.createConicGradient(a0, cx, cy);
				g.addColorStop(0, 'rgba(0,0,0,0)');
				g.addColorStop(0.06, col);
				g.addColorStop(0.12, 'rgba(255,255,255,0.18)');
				g.addColorStop(0.18, 'rgba(0,0,0,0)');
				g.addColorStop(1, 'rgba(0,0,0,0)');
				ctx.fillStyle = g;
				ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
			}
			ctx.restore();
			// rim
			ctx.strokeStyle = 'rgba(230,230,233,0.35)';
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
			ctx.stroke();
			ctx.restore();
		},
	};
}

// Print artwork for the CD shelf, drawn on canvases in the zine's glitch key:
// front booklet, spine strip, back insert (tracklist) and disc label. A CD
// with its own `cover` image uses that for the booklet instead.

import { FONT } from '../pretext/fonts';
import { drawRoach } from '../brand/roach';
import { hash } from '../editor/glitch';

export interface Cd {
	title: string;
	artist: string;
	year?: string;
	color: string; // main print colour
	tracks: string[];
	cover?: string | null; // image url for the booklet, else drawn here
}

const INK = '#050506';
const PAPER = '#e6e6e9';
const ACCENTS = ['#00ff9c', '#ff2e4d', '#13e8ff'];

const make = (w: number, h: number) => {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	return [c, c.getContext('2d')!] as const;
};

function scanlines(g: CanvasRenderingContext2D, w: number, h: number, a = 0.16) {
	g.fillStyle = `rgba(0,0,0,${a})`;
	for (let y = 0; y < h; y += 4) g.fillRect(0, y + 2, w, 2);
}

function blocks(g: CanvasRenderingContext2D, w: number, h: number, seed: number, n: number, cols: string[]) {
	for (let i = 0; i < n; i++) {
		g.globalAlpha = 0.35 + hash(seed, i, 1) * 0.6;
		g.fillStyle = cols[Math.floor(hash(seed, i, 2) * cols.length)];
		const bw = 8 + hash(seed, i, 3) * (hash(seed, i, 4) > 0.85 ? w * 0.6 : 90);
		g.fillRect(hash(seed, i, 5) * w, hash(seed, i, 6) * h, bw, 3 + hash(seed, i, 7) * 16);
	}
	g.globalAlpha = 1;
}

function fitText(g: CanvasRenderingContext2D, text: string, font: (px: number) => string, maxW: number, start: number) {
	let px = start;
	g.font = font(px);
	while (g.measureText(text).width > maxW && px > 10) g.font = font(--px);
	return px;
}

/** 1024² front booklet. */
export function coverArt(cd: Cd, i: number): HTMLCanvasElement {
	const S = 1024;
	const [c, g] = make(S, S);
	g.fillStyle = cd.color;
	g.fillRect(0, 0, S, S);
	// a big hard-cut plane, offset like the editor view's registration
	g.fillStyle = INK;
	g.beginPath();
	g.moveTo(0, S * (0.55 + hash(i, 9) * 0.1));
	g.lineTo(S, S * (0.35 + hash(i, 10) * 0.15));
	g.lineTo(S, S);
	g.lineTo(0, S);
	g.fill();
	blocks(g, S, S, i * 13 + 1, 70, [INK, PAPER, ...ACCENTS]);
	// the roach, with a channel split
	const rh = S * 0.62;
	const rx = S * (0.58 + hash(i, 11) * 0.12);
	const ry = S * 0.2;
	g.globalCompositeOperation = 'multiply';
	drawRoach(g, rx - 10, ry, rh, '#ff2e4d');
	drawRoach(g, rx + 10, ry + 4, rh, '#13e8ff');
	g.globalCompositeOperation = 'source-over';
	drawRoach(g, rx, ry, rh, INK);
	// title
	g.fillStyle = PAPER;
	g.textBaseline = 'alphabetic';
	const title = cd.title.toUpperCase();
	const px = fitText(g, title, FONT.display, S * 0.86, 150);
	g.fillText(title, S * 0.07, S * 0.9);
	g.font = FONT.mono(34);
	g.fillStyle = cd.color;
	g.fillText(`${cd.artist.toUpperCase()}${cd.year ? `  //  ${cd.year}` : ''}`, S * 0.07, S * 0.9 - px * 0.95);
	g.fillStyle = PAPER;
	g.font = FONT.mono(26);
	g.fillText(`RW-${String(i + 1).padStart(2, '0')}`, S * 0.07, S * 0.08);
	scanlines(g, S, S);
	return c;
}

/** Spine strip: 100 × 1200 (case depth : height). Text runs top → bottom. */
export function spineArt(cd: Cd, i: number): HTMLCanvasElement {
	const w = 100, h = 1200;
	const [c, g] = make(w, h);
	g.fillStyle = INK;
	g.fillRect(0, 0, w, h);
	g.fillStyle = cd.color;
	g.fillRect(0, 0, w, 150);
	g.fillRect(0, h - 26, w, 26);
	drawRoach(g, w / 2 - 10, 18, 114, INK);
	g.save();
	g.translate(w / 2, 175);
	g.rotate(Math.PI / 2);
	g.textBaseline = 'middle';
	const title = cd.title.toUpperCase();
	g.fillStyle = PAPER;
	const px = fitText(g, title, FONT.display, 640, 56);
	g.fillText(title, 0, 0);
	g.font = FONT.mono(26);
	g.fillStyle = cd.color;
	const tw = g.measureText(cd.artist.toUpperCase()).width;
	g.fillText(cd.artist.toUpperCase(), Math.min(680, 640) + 20, 0);
	g.restore();
	g.save();
	g.translate(w / 2, h - 44);
	g.rotate(Math.PI / 2);
	g.textAlign = 'right';
	g.textBaseline = 'middle';
	g.font = FONT.mono(24);
	g.fillStyle = PAPER;
	g.fillText(`RW-${String(i + 1).padStart(2, '0')}`, 0, 0);
	g.restore();
	void px;
	void tw;
	scanlines(g, w, h, 0.12);
	return c;
}

/** Back insert, 1136 × 1000 (case width : height): tracklist + barcode. */
export function backArt(cd: Cd, i: number): HTMLCanvasElement {
	const w = 1136, h = 1000;
	const [c, g] = make(w, h);
	g.fillStyle = INK;
	g.fillRect(0, 0, w, h);
	g.fillStyle = cd.color;
	g.fillRect(0, 0, w, 14);
	blocks(g, w, h, i * 31 + 7, 26, [cd.color, ...ACCENTS]);
	g.fillStyle = cd.color;
	g.font = FONT.mono(28);
	g.fillText('// TRACKLIST', 90, 120);
	g.font = FONT.body(36);
	const tracks = cd.tracks.length ? cd.tracks : Array.from({ length: 8 }, () => '—');
	tracks.slice(0, 14).forEach((t, k) => {
		g.fillStyle = ACCENTS[0];
		g.font = FONT.mono(26);
		g.fillText(String(k + 1).padStart(2, '0'), 90, 190 + k * 52);
		g.fillStyle = PAPER;
		g.font = FONT.body(34);
		g.fillText(t, 160, 190 + k * 52);
	});
	// barcode
	let x = w - 330;
	for (let k = 0; x < w - 90; k++) {
		const bw = 3 + Math.floor(hash(i, k, 3) * 9);
		if (hash(i, k, 4) > 0.4) {
			g.fillStyle = PAPER;
			g.fillRect(x, h - 190, bw, 110);
		}
		x += bw + 2;
	}
	g.fillStyle = PAPER;
	g.font = FONT.mono(22);
	g.fillText('ROACHWORLD RECORDS', w - 330, h - 54);
	drawRoach(g, 90, h - 210, 150, cd.color);
	scanlines(g, w, h, 0.12);
	return c;
}

/** Disc label, 1024². */
export function discArt(cd: Cd, i: number): HTMLCanvasElement {
	const S = 1024, R = S / 2;
	const [c, g] = make(S, S);
	// mirror ring
	const ring = g.createRadialGradient(R, R, R * 0.2, R, R, R);
	ring.addColorStop(0, '#9aa0a8');
	ring.addColorStop(0.6, '#e8ecf2');
	ring.addColorStop(1, '#8a8f98');
	g.fillStyle = ring;
	g.fillRect(0, 0, S, S);
	// printed label
	g.fillStyle = cd.color;
	g.beginPath();
	g.arc(R, R, R * 0.93, 0, Math.PI * 2);
	g.fill();
	g.save();
	g.beginPath();
	g.arc(R, R, R * 0.93, 0, Math.PI * 2);
	g.clip();
	blocks(g, S, S, i * 7 + 3, 40, [INK, PAPER, ...ACCENTS]);
	g.restore();
	g.fillStyle = INK;
	g.textAlign = 'center';
	const title = cd.title.toUpperCase();
	fitText(g, title, FONT.display, S * 0.6, 84);
	g.fillText(title, R, R - R * 0.42);
	g.font = FONT.mono(30);
	g.fillText(cd.artist.toUpperCase(), R, R + R * 0.5);
	// clear hub + hole
	g.fillStyle = '#c9ced6';
	g.beginPath();
	g.arc(R, R, R * 0.3, 0, Math.PI * 2);
	g.fill();
	g.fillStyle = INK;
	g.beginPath();
	g.arc(R, R, R * 0.12, 0, Math.PI * 2);
	g.fill();
	return c;
}

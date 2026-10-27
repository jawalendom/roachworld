// The roach simulation behind the ASCII pieces, independent of how it's shown:
// roaches crawl (planted-foot tripod gait), freeze and dart; squashed ones stay
// where they died. Each frame the scene is drawn into a tiny "source" canvas, one
// pixel per character cell, and `cells()` maps each pixel to a glyph + ink — the
// caller draws those however suits it (WebGL for the full screen, 2D text for the
// issue-page strip).
//
// Positions are in square world units (one reference cell's width at REF px) so
// changing the character size zooms the picture rather than re-scattering it.

/** dense → sparse, like ascii-magic's "Standard" set */
export const RAMP = '@#S08Xx+=-;:.';
export const INKS = ['#e6e6e9', '#00ff9c', '#ff2e4d', '#13e8ff'];
export const BG = '#050506';
export const REF = 14;
const MAX_DEAD = 90;

interface Roach {
	x: number; // centre, in reference cells
	y: number;
	a: number; // heading, radians (0 = right)
	turn: number; // current turn rate, rad/s
	len: number; // body length in reference cells
	speed: number; // current speed, cells/s
	cruise: number; // this roach's usual speed
	target: number; // speed it's easing toward
	mode: 'run' | 'pause' | 'dart';
	modeT: number; // seconds left in this mode
	stride: number; // gait phase, advances with distance: 0..π tripod A swings, π..2π tripod B
	feet: { x: number; y: number }[]; // where each foot is planted, in reference cells
	lift: { x: number; y: number }[]; // where a swinging foot left the ground
	swinging: boolean[];
	ink: number;
	phase: number;
	small: boolean; // one of the swarm that only turns up zoomed out
}

// Six legs in the body's frame (units of body length, head toward -y): the hip,
// and where the foot rests mid-stride. Tripod A = left fore, right mid, left
// hind; tripod B the other three — they alternate, like a real roach.
const LEGS = [-1, 1].flatMap((side) =>
	[
		{ hip: [0.06, -0.2], rest: [0.34, -0.5] },
		{ hip: [0.07, -0.1], rest: [0.44, -0.08] },
		{ hip: [0.07, 0.0], rest: [0.4, 0.38] },
	].map((l, i) => ({
		side,
		tripodA: (i % 2 === 0) === (side < 0),
		hip: [l.hip[0] * side, l.hip[1]] as [number, number],
		rest: [l.rest[0] * side, l.rest[1]] as [number, number],
	})),
);
const STRIDE = 0.42; // body lengths travelled per half gait cycle

interface Dead {
	x: number;
	y: number;
	a: number;
	len: number;
	ink: number;
	stride: number;
	at: number; // time of death
	seed: number;
}

export interface FieldOpts {
	/** fixed population (no swarm) */
	count?: number;
	/** mostly left ↔ right, with the odd diagonal or vertical one */
	horizontal?: boolean;
	/** faint dots in the empty cells (default on) */
	dots?: boolean;
	/** body length range in reference cells, unscaled (horizontal: sized to the band) */
	len?: [number, number];
}

export interface RoachField {
	/** the grid being drawn (cols × rows) and the world it shows, in square
	 *  units (one reference cell's width) */
	setGrid(cols: number, rows: number, worldW: number, worldH: number): void;
	/** 0 at the default size → 1 zoomed all the way out (drives the swarm) */
	setZoom(z: number): void;
	step(t: number, dt: number): void;
	/** per cell: glyph index into RAMP, ink index into INKS, opacity 0–255 */
	cells(t: number): Uint8Array;
	/** squash the roach under a point (reference cells); true if one died */
	squash(x: number, y: number, slack: number, t: number): boolean;
}

export function createRoachField(o: FieldOpts = {}): RoachField {
	const src = document.createElement('canvas');
	const s = src.getContext('2d', { willReadFrequently: true })!;
	let cols = 1, rows = 1, refCols = 1, refRows = 1, zoom = 0;
	const roaches: Roach[] = [];
	const dead: Dead[] = [];
	const H = !!o.horizontal;

	const rnd = (a: number, b: number) => a + Math.random() * (b - a);
	// each roach runs a little state machine — scuttle, freeze, dart — with its
	// own wandering heading, so they cross at every angle and never in step
	function nextMode(r: Roach) {
		const p = Math.random();
		if (p < 0.6) {
			r.mode = 'run';
			r.modeT = rnd(0.6, 3.2);
			r.turn = H ? rnd(-0.15, 0.15) : Math.random() < 0.5 ? rnd(-0.25, 0.25) : rnd(-0.8, 0.8);
			r.target = r.cruise * rnd(0.6, 1.25);
		} else if (p < 0.8) {
			r.mode = 'pause';
			r.modeT = rnd(0.2, 1.8);
			r.turn = 0;
			r.target = 0;
		} else {
			r.mode = 'dart';
			r.modeT = rnd(0.2, 0.7);
			r.a += H ? rnd(-0.5, 0.5) : rnd(-1.2, 1.2); // a sudden change of mind
			r.turn = H ? rnd(-0.6, 0.6) : rnd(-2.4, 2.4);
			r.target = r.cruise * rnd(2, 3.4);
		}
	}
	function spawn(inside = false, small = false): Roach {
		const len = o.len ? rnd(...o.len) : H ? rnd(0.3, 0.5) * refRows : (small ? rnd(2.2, 5.5) : rnd(6, 19)) * Math.sqrt(Math.min(1, refCols / 110));
		let x: number, y: number, a: number;
		if (H) {
			// mostly in from the sides, heading across; now and then one from the
			// top or bottom on a slant
			const side = Math.random() < 0.85;
			const dir = Math.random() < 0.5 ? 1 : -1;
			if (inside) (x = rnd(0, refCols)), (y = rnd(0.2, 0.8) * refRows);
			else if (side) (x = dir > 0 ? -len : refCols + len), (y = rnd(0.2, 0.8) * refRows);
			else (x = rnd(0.2, 0.8) * refCols), (y = Math.random() < 0.5 ? -len : refRows + len);
			a = side || inside ? (dir > 0 ? 0 : Math.PI) + rnd(-0.35, 0.35) : Math.atan2(refRows / 2 - y, rnd(-1, 1) * refRows);
		} else {
			if (inside) {
				x = rnd(0, refCols);
				y = rnd(0, refRows);
			} else {
				// just off a random edge
				const e = Math.floor(Math.random() * 4);
				x = e === 0 ? -len : e === 1 ? refCols + len : rnd(0, refCols);
				y = e === 2 ? -len : e === 3 ? refRows + len : rnd(0, refRows);
			}
			// aim at a random point on screen: horizontal, vertical, diagonal, anything
			a = inside ? rnd(0, Math.PI * 2) : Math.atan2(rnd(0.1, 0.9) * refRows - y, rnd(0.1, 0.9) * refCols - x) + rnd(-0.4, 0.4);
		}
		const cruise = rnd(4, 11) * (14 / Math.max(len, 4)) ** 0.3;
		const r: Roach = { x, y, a, turn: 0, len, speed: cruise, cruise, target: cruise, mode: 'run', modeT: 0, stride: rnd(0, 6), feet: [], lift: [], swinging: LEGS.map(() => false), ink: Math.floor(Math.random() * INKS.length), phase: Math.random() * 100, small };
		r.feet = LEGS.map((l) => toWorld(r, l.rest[0], l.rest[1]));
		r.lift = r.feet.map((f) => ({ ...f }));
		nextMode(r);
		if (r.mode === 'pause' && !inside) nextMode(r);
		return r;
	}
	// body frame (units of body length, head −y) ↔ reference cells
	const bodyAngle = (r: Roach) => r.a + Math.PI / 2 + Math.sin(r.stride) * 0.08 * Math.min(1, r.speed / r.cruise);
	function toWorld(r: Roach, lx: number, ly: number, th = bodyAngle(r)) {
		const c = Math.cos(th), s = Math.sin(th);
		return { x: r.x + (lx * c - ly * s) * r.len, y: r.y + (lx * s + ly * c) * r.len };
	}
	function toLocal(r: Roach, wx: number, wy: number, th: number) {
		const c = Math.cos(th), s = Math.sin(th);
		const dx = (wx - r.x) / r.len, dy = (wy - r.y) / r.len;
		return [dx * c + dy * s, -dx * s + dy * c] as const;
	}
	// the swarm: small, quick roaches that pour in the further out you zoom
	const countSmall = () => (o.count != null ? 0 : Math.round(zoom ** 1.3 * Math.max(40, Math.min(220, (refCols * refRows) / 68))));
	const count = () => o.count ?? Math.round(Math.max(22, Math.min(60, (refCols * refRows) / 440)));

	// keep each kind at its target: big ones by screen area, the swarm by zoom.
	// When zooming out the swarm appears all over at once; zooming back in, it thins.
	function syncPopulation(scatter: boolean) {
		const want = [count(), countSmall()];
		[false, true].forEach((small, w) => {
			let have = roaches.filter((r) => r.small === small).length;
			while (have < want[w]) roaches.push(spawn(scatter, small)), have++;
			for (let i = roaches.length - 1; i >= 0 && have > want[w]; i--) if (roaches[i].small === small) roaches.splice(i, 1), have--;
		});
	}

	// a fixed grain so solid bodies break into mixed characters, like a photo would
	const grain = new Float32Array(4096).map(() => 0.55 + Math.random() * 0.45);

	/** A roach in its own frame: head toward -y, length L, centred on 0,0.
	 *  `gait` swings the legs (tripod: L1 R2 L3 against R1 L2 R3); `flat` (0..1)
	 *  squashes it — body spread, legs splayed and bent. */
	function bug(c: CanvasRenderingContext2D, L: number, ink: string, gait: number, ant: number, flat = 0, feet?: (readonly [number, number])[]) {
		c.fillStyle = ink;
		c.strokeStyle = ink;
		c.lineCap = 'round';
		c.lineJoin = 'round';
		// legs first, under the body
		c.lineWidth = Math.max(0.5 * px, L * 0.045);
		if (feet) {
			// two-bone legs: hip → knee → planted foot, knee bent outward
			LEGS.forEach((l, j) => {
				const [hx, hy] = l.hip, [fx, fy] = feet[j];
				const seg = Math.hypot(l.rest[0] - hx, l.rest[1] - hy) * 0.62;
				const dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy) || 1e-6;
				const bend = Math.sqrt(Math.max(0, seg * seg - (d / 2) ** 2));
				let nx = -dy / d, ny = dx / d;
				if (Math.sign(nx) !== l.side) (nx = -nx), (ny = -ny);
				const kx = hx + dx / 2 + nx * bend, ky = hy + dy / 2 + ny * bend;
				c.beginPath();
				c.moveTo(hx * L, hy * L);
				c.lineTo(kx * L, ky * L);
				c.lineTo(fx * L, fy * L);
				c.stroke();
			});
		}
		const hips = [-0.13, -0.03, 0.08];
		for (let side = -1; side <= 1 && !feet; side += 2) {
			hips.forEach((hy, i) => {
				const tri = (i % 2 === 0) === (side < 0) ? 1 : -1;
				const swing = Math.sin(gait) * 0.42 * tri * (1 - flat);
				const base = [-0.85, 0.15, 0.95][i] + swing; // fore legs reach forward, hind legs back
				const spread = 1 + flat * 0.35;
				const kx = side * Math.cos(base * 0.9) * 0.28 * L * spread;
				const ky = hy * L + Math.sin(base) * 0.16 * L;
				const fx = kx + side * (0.12 + i * 0.04) * L * spread;
				const fy = ky + (i === 0 ? -0.16 : i === 1 ? 0.05 : 0.26) * L * (1 + flat * 0.3);
				c.beginPath();
				c.moveTo(side * 0.08 * L, hy * L);
				c.lineTo(kx, ky);
				c.lineTo(fx, fy);
				c.stroke();
			});
		}
		// antennae: long, sweeping
		c.lineWidth = Math.max(0.3 * px, L * 0.022);
		for (let side = -1; side <= 1; side += 2) {
			const sw = side * (0.25 + ant * side * 0.18) + flat * side * 0.5;
			c.beginPath();
			c.moveTo(side * 0.03 * L, -0.42 * L);
			c.quadraticCurveTo(side * 0.12 * L + sw * 0.15 * L, -0.75 * L, sw * 0.55 * L, -1.02 * L);
			c.stroke();
		}
		// cerci at the tail
		c.beginPath();
		c.moveTo(-0.05 * L, 0.46 * L);
		c.lineTo(-0.11 * L, 0.58 * L);
		c.moveTo(0.05 * L, 0.46 * L);
		c.lineTo(0.11 * L, 0.58 * L);
		c.stroke();
		const wide = 1 + flat * 0.45, short = 1 - flat * 0.12;
		// wings / abdomen
		c.beginPath();
		c.ellipse(0, 0.1 * L * short, 0.2 * L * wide, 0.36 * L * short, 0, 0, Math.PI * 2);
		c.fill();
		// pronotum shield
		c.beginPath();
		c.ellipse(0, -0.28 * L * short, 0.18 * L * wide, 0.12 * L, 0, 0, Math.PI * 2);
		c.fill();
		// head
		c.beginPath();
		c.ellipse(0, -0.4 * L * short, 0.07 * L * wide, 0.055 * L, 0, 0, Math.PI * 2);
		c.fill();
		// the seam between the wings, and the shield's rim: darker lines give the
		// ramp something to pick out
		c.strokeStyle = 'rgba(0,0,0,0.75)';
		c.lineWidth = Math.max(0.3 * px, L * 0.03);
		c.beginPath();
		c.moveTo(0, -0.16 * L);
		c.lineTo(0, 0.44 * L * short);
		c.stroke();
		c.beginPath();
		c.ellipse(0, -0.28 * L * short, 0.13 * L * wide, 0.07 * L, 0, 0.15 * Math.PI, 0.85 * Math.PI);
		c.stroke();
	}

	function splat(c: CanvasRenderingContext2D, L: number, ink: string, seed: number, grow: number) {
		// a ragged smear under the body, plus a few flecks
		const h = (n: number) => {
			const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
			return x - Math.floor(x);
		};
		c.save();
		c.globalAlpha = 0.3;
		c.fillStyle = ink;
		c.beginPath();
		const N = 14;
		for (let i = 0; i <= N; i++) {
			const t = (i / N) * Math.PI * 2;
			const rr = L * (0.26 + h(i) * 0.18) * grow;
			const px = Math.cos(t) * rr * 1.1, py = Math.sin(t) * rr * 1.25;
			if (i === 0) c.moveTo(px, py);
			else c.lineTo(px, py);
		}
		c.fill();
		for (let i = 0; i < 6; i++) {
			const t = h(i + 20) * Math.PI * 2, d = L * (0.4 + h(i + 30) * 0.3) * grow;
			c.beginPath();
			c.arc(Math.cos(t) * d, Math.sin(t) * d, L * (0.03 + h(i + 40) * 0.05), 0, Math.PI * 2);
			c.fill();
		}
		c.restore();
	}

	// one source pixel per character cell, but cells are taller than wide: draw in
	// world units (squares) and let the transform squeeze y, so a roach keeps its
	// shape whichever way it faces
	let px = 1; // one source pixel, in world units — floor for line widths
	function drawSource(t: number) {
		s.setTransform(1, 0, 0, 1, 0, 0);
		s.globalAlpha = 1;
		s.fillStyle = '#000';
		s.fillRect(0, 0, cols, rows);
		const kx = cols / refCols, ky = rows / refRows;
		px = 1 / kx;
		s.setTransform(kx, 0, 0, ky, 0, 0);
		// the dead, where they fell
		for (const d of dead) {
			const grow = Math.min(1, (t - d.at) / 0.12);
			s.save();
			s.translate(d.x, d.y);
			s.rotate(d.a + Math.PI / 2);
			splat(s, d.len, INKS[d.ink], d.seed, grow);
			s.globalAlpha = 0.7; // dimmer than the living
			bug(s, d.len, INKS[d.ink], d.stride, 0, 1);
			s.globalAlpha = 1;
			s.restore();
		}
		for (const r of roaches) {
			const th = bodyAngle(r);
			const ant = Math.sin(t * (r.mode === 'pause' ? 11 : 5) + r.phase) * (r.mode === 'pause' ? 0.9 : 0.5);
			const feet = r.feet.map((f) => toLocal(r, f.x, f.y, th));
			s.save();
			s.translate(r.x, r.y);
			s.rotate(th); // drawn head-up
			bug(s, r.len, INKS[r.ink], r.stride, ant, 0, feet);
			s.restore();
		}
	}

	/** Advance one roach; false if it walked off and was replaced. */
	function stepRoach(i: number, t: number, dt: number): boolean {
		{
			const r = roaches[i];
			if ((r.modeT -= dt) <= 0) nextMode(r);
			r.speed += (r.target - r.speed) * (1 - Math.exp(-(r.mode === 'pause' ? 14 : 6) * dt));
			// the body surges with each push of a tripod rather than gliding: fastest
			// mid-stance, almost stopped as the legs change over
			const p = ((r.stride % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
			const v = r.speed * (0.25 + 1.5 * Math.sin(p) ** 2);
			r.a += (r.turn + Math.sin(t * 2.3 + r.phase) * 0.2) * dt * (0.4 + Math.sin(p) ** 2);
			r.x += Math.cos(r.a) * v * dt;
			r.y += Math.sin(r.a) * v * dt;
			r.stride += ((v * dt) / (STRIDE * r.len)) * Math.PI;
			// feet: planted ones stay put on the ground; the swinging tripod lifts and
			// reaches ahead of its resting spot
			const q = ((r.stride % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
			const aSwing = q < Math.PI;
			const prog = (aSwing ? q : q - Math.PI) / Math.PI;
			const ease = prog * prog * (3 - 2 * prog);
			const th = bodyAngle(r);
			LEGS.forEach((l, j) => {
				const swing = l.tripodA === aSwing;
				const foot = r.feet[j];
				if (swing && !r.swinging[j]) r.lift[j] = { ...foot };
				r.swinging[j] = swing;
				if (swing) {
					const tgt = toWorld(r, l.rest[0], l.rest[1] - STRIDE / 2, th);
					foot.x = r.lift[j].x + (tgt.x - r.lift[j].x) * ease;
					foot.y = r.lift[j].y + (tgt.y - r.lift[j].y) * ease;
				}
				// a hard turn or a dart can leave a foot behind: step it back under
				const home = toWorld(r, l.rest[0], l.rest[1], th);
				if (Math.hypot(foot.x - home.x, foot.y - home.y) > r.len * 0.6) Object.assign(foot, home), (r.lift[j] = { ...home });
			});
			const m = r.len + 2;
			if (r.x < -m || r.x > refCols + m || r.y < -m || r.y > refRows + m) {
				roaches[i] = spawn(false, r.small);
				return false;
			}
			return true;
		}
	}

	let cells = new Uint8Array(0);

	return {
		setGrid(c, r, rc, rr) {
			cols = c;
			rows = r;
			refCols = rc;
			refRows = rr;
			src.width = cols;
			src.height = rows;
			if (!roaches.length) for (let i = 0; i < count(); i++) roaches.push(spawn(true));
			syncPopulation(true);
		},
		setZoom(z) {
			zoom = z;
			syncPopulation(true);
		},
		step(t, dtIn) {
			// in the swarm the big ones bolt too: up to 2.5× on top of the zoom pace
			const bigBoost = 1 + 1.5 * zoom;
			for (let i = 0; i < roaches.length; i++) {
				const total = roaches[i].small ? dtIn : dtIn * bigBoost;
				// sub-steps keep the gait smooth at high speed
				const n = Math.max(1, Math.ceil(total / 0.025));
				for (let j = 0; j < n && stepRoach(i, t, total / n); j++);
			}
			syncPopulation(false);
		},
		cells(t) {
			drawSource(t);
			const px = s.getImageData(0, 0, cols, rows).data;
			if (cells.length !== cols * rows * 3) cells = new Uint8Array(cols * rows * 3);
			const shimmer = Math.floor(t * 6);
			for (let y = 0; y < rows; y++) {
				for (let x = 0; x < cols; x++) {
					const n = y * cols + x, i = n * 4, c = n * 3;
					const rr = px[i], gg = px[i + 1], bb = px[i + 2];
					const lum = Math.max(rr, gg, bb) / 255;
					const v = Math.pow(lum, 0.7) * grain[(x * 31 + y * 17 + shimmer * 7) & 4095];
					// faint dot grid in the empty space
					if (v < 0.08) {
						cells[c] = RAMP.length - 1;
						cells[c + 1] = 0;
						cells[c + 2] = o.dots !== false && (x + y * 3) % 7 === 0 ? 46 : 0;
						continue;
					}
					cells[c] = Math.min(RAMP.length - 2, Math.floor((1 - v) * (RAMP.length - 1)));
					// nearest ink by its dominant channels
					cells[c + 1] = Math.max(rr, gg, bb) - Math.min(rr, gg, bb) < 40 ? 0 : rr > gg && rr > bb ? 2 : gg > 200 && bb > 200 ? 3 : bb > rr && bb > gg ? 3 : 1;
					cells[c + 2] = 255;
				}
			}
			return cells;
		},
		squash(x, y, slack, t) {
			let best = -1, bestD = Infinity;
			roaches.forEach((r, i) => {
				const dx = x - r.x, dy = y - r.y;
				const ang = -(r.a + Math.PI / 2);
				const lx = dx * Math.cos(ang) - dy * Math.sin(ang);
				const ly = dx * Math.sin(ang) + dy * Math.cos(ang);
				const d = (lx / (r.len * 0.3 + slack)) ** 2 + (ly / (r.len * 0.55 + slack)) ** 2;
				if (d < 1 && d < bestD) {
					best = i;
					bestD = d;
				}
			});
			if (best < 0) return false;
			const r = roaches[best];
			dead.push({ x: r.x, y: r.y, a: r.a, len: r.len, ink: r.ink, stride: r.stride, at: t, seed: Math.random() * 1000 });
			if (dead.length > MAX_DEAD) dead.shift();
			roaches.splice(best, 1);
			// the neighbours bolt
			for (const q of roaches) {
				const dx = q.x - r.x, dy = q.y - r.y, d = Math.hypot(dx, dy);
				if (d < 18) {
					q.mode = 'dart';
					q.modeT = rnd(0.4, 0.9);
					q.a = Math.atan2(dy, dx) + rnd(-0.5, 0.5);
					q.turn = rnd(-0.6, 0.6);
					q.target = q.cruise * rnd(2.6, 3.6);
				}
			}
			return true;
		},
	};
}

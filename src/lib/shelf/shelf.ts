// The CD shelf: five jewel cases standing spine-out on a shelf. Hover pulls a
// case out a little; click takes it off the shelf and turns it to face you;
// drag turns it; tap opens the hinged lid and the disc lifts and spins.
// Units are millimetres (a jewel case is 142 × 125 × 10.4).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { fontsReady } from '../pretext/fonts';
import { coverArt, spineArt, backArt, discArt, pictureDisc, type Cd } from './art';

const CW = 142, CH = 125, CD = 10.4; // case width, height, depth
const TRAY = 7.4, LID = 2.6;
const SHELF_Y = 0;
const GAP = 3.2;
const DISC_UP = Math.PI / 2; // disc rotation at which its printed cover sits upright

type Mode = 'shelf' | 'inspect';

interface CaseRig {
	group: THREE.Group; // whole case (pose)
	lidPivot: THREE.Group; // hinge
	disc: THREE.Mesh;
	shelfPos: THREE.Vector3;
	shelfRotY: number;
	pull: number; // hover pull-out, 0..1
	open: number; // lid, 0..1
	discLift: number;
	discSpin: number;
	hit: THREE.Object3D[];
	glare: THREE.Mesh; // light streak across the lid
	sparkles: { s: THREE.Sprite; phase: number; rate: number; size: number }[];
}

export interface ShelfUi {
	label: HTMLElement; // hover/selected title
	hint: HTMLElement;
	back: HTMLButtonElement;
	/** the held cd was opened (true) or closed / put back (false) */
	onOpen?: (i: number, open: boolean) => void;
}

export async function mountShelf(host: HTMLElement, cds: Cd[], ui: ShelfUi, o: { full: boolean }) {
	await fontsReady();
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
	renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	renderer.setClearColor(0x050506, 1);
	host.prepend(renderer.domElement);
	const canvas = renderer.domElement;
	canvas.style.display = 'block';
	canvas.style.width = '100%';
	canvas.style.height = '100%';
	canvas.style.touchAction = o.full ? 'none' : 'pan-y';

	const scene = new THREE.Scene();
	scene.fog = new THREE.Fog(0x050506, 420, 900);
	// a soft studio environment for the plastic and disc to reflect: this is
	// what makes the gloss slide around as a case turns
	const pmrem = new THREE.PMREMGenerator(renderer);
	const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // given only to plastic + disc
	const camera = new THREE.PerspectiveCamera(32, 1, 1, 2000);
	const camHome = new THREE.Vector3(0, 104, 400);
	const lookHome = new THREE.Vector3(0, 62, 40);
	camera.position.copy(camHome);

	// ── light: soft key, green + red rims, a little fill ──────────────────
	scene.add(new THREE.AmbientLight(0xffffff, 0.35));
	const key = new THREE.DirectionalLight(0xffffff, 1.6);
	key.position.set(120, 260, 260);
	scene.add(key);
	const rimG = new THREE.PointLight(0x00ff9c, 2600, 0, 2);
	rimG.position.set(-170, 120, 80);
	scene.add(rimG);
	const rimR = new THREE.PointLight(0xff2e4d, 2200, 0, 2);
	rimR.position.set(180, 40, 60);
	scene.add(rimR);

	// ── the shelf ─────────────────────────────────────────────────────────
	// a thick glass shelf: see-through, catches reflections, edges lit faintly
	const GT = 12; // glass thickness
	const glassGeo = new THREE.BoxGeometry(260, GT, 170);
	const glass = new THREE.Mesh(
		glassGeo,
		new THREE.MeshPhysicalMaterial({
			color: 0xbfe9dc, transparent: true, opacity: 0.1, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03,
			envMap, envMapIntensity: 0.7, depthWrite: false, side: THREE.DoubleSide,
		}),
	);
	glass.position.set(0, SHELF_Y - GT / 2, 0);
	glass.renderOrder = 1;
	scene.add(glass);
	const glassEdges = new THREE.LineSegments(
		new THREE.EdgesGeometry(glassGeo),
		new THREE.LineBasicMaterial({ color: 0xdfffee, transparent: true, opacity: 0.28 }),
	);
	glassEdges.position.copy(glass.position);
	scene.add(glassEdges);
	// the green lip along the front edge, a touch inside the glass
	const edge = new THREE.Mesh(new THREE.BoxGeometry(258, 0.9, 0.6), new THREE.MeshBasicMaterial({ color: 0x00ff9c, transparent: true, opacity: 0.8 }));
	edge.position.set(0, SHELF_Y - 0.6, 85.2);
	scene.add(edge);
	// two small brackets holding it to the wall
	const steel = new THREE.MeshStandardMaterial({ color: 0x2a2c32, metalness: 0.9, roughness: 0.35, envMap, envMapIntensity: 0.4 });
	for (const bx of [-95, 95]) {
		const arm = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 90), steel);
		arm.position.set(bx, SHELF_Y - GT - 2.5, -40);
		scene.add(arm);
		const post = new THREE.Mesh(new THREE.BoxGeometry(5, 34, 5), steel);
		post.position.set(bx, SHELF_Y - GT - 17, -83);
		scene.add(post);
	}
	const wall = new THREE.Mesh(new THREE.PlaneGeometry(900, 500), new THREE.MeshStandardMaterial({ color: 0x0a0a0d, roughness: 1, envMapIntensity: 0 }));
	wall.position.set(0, 120, -90);
	scene.add(wall);
	// bookend
	const bookend = new THREE.Mesh(new THREE.BoxGeometry(4, 80, 130), new THREE.MeshStandardMaterial({ color: 0x00ff9c, roughness: 0.4, metalness: 0.3 }));
	scene.add(bookend);

	// ── cases ─────────────────────────────────────────────────────────────
	const tex = (c: HTMLCanvasElement) => {
		const t = new THREE.CanvasTexture(c);
		t.colorSpace = THREE.SRGBColorSpace;
		t.anisotropy = renderer.capabilities.getMaxAnisotropy();
		return t;
	};
	const loadCover = (cd: Cd, i: number) =>
		new Promise<HTMLCanvasElement>((res) => {
			if (!cd.cover) return res(coverArt(cd, i));
			const img = new Image();
			img.onload = () => {
				const c = document.createElement('canvas');
				c.width = c.height = 1024;
				const g = c.getContext('2d')!;
				const s = Math.max(1024 / img.width, 1024 / img.height);
				g.drawImage(img, (1024 - img.width * s) / 2, (1024 - img.height * s) / 2, img.width * s, img.height * s);
				res(c);
			};
			img.onerror = () => res(coverArt(cd, i));
			img.src = cd.cover;
		});

	// clear plastic all round, so the disc shows through even when shut
	const clearTray = new THREE.MeshPhysicalMaterial({
		color: 0xdfe6ee, transparent: true, opacity: 0.2, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02,
		envMap, envMapIntensity: 0.9, specularIntensity: 1, depthWrite: false,
	});
	const clear = new THREE.MeshPhysicalMaterial({
		color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.02, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02,
		envMap, envMapIntensity: 1.2, specularIntensity: 1, depthWrite: false,
	});
	// glare: a soft diagonal band of light, slid across the lid as it turns
	const glareTex = (() => {
		const c = document.createElement('canvas');
		c.width = c.height = 512;
		const g = c.getContext('2d')!;
		g.translate(256, 256);
		g.rotate(-0.55);
		const grad = g.createLinearGradient(-200, 0, 200, 0);
		grad.addColorStop(0, 'rgba(255,255,255,0)');
		grad.addColorStop(0.42, 'rgba(255,255,255,0.05)');
		grad.addColorStop(0.5, 'rgba(255,255,255,0.75)');
		grad.addColorStop(0.53, 'rgba(255,255,255,0.12)');
		grad.addColorStop(0.62, 'rgba(255,255,255,0.3)');
		grad.addColorStop(0.66, 'rgba(255,255,255,0)');
		g.fillStyle = grad;
		g.fillRect(-400, -400, 800, 800);
		const t = new THREE.CanvasTexture(c);
		t.colorSpace = THREE.SRGBColorSpace;
		return t;
	})();
	// sparkle: a four-point star
	const starTex = (() => {
		const c = document.createElement('canvas');
		c.width = c.height = 128;
		const g = c.getContext('2d')!;
		const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
		r.addColorStop(0, 'rgba(255,255,255,1)');
		r.addColorStop(0.12, 'rgba(255,255,255,0.8)');
		r.addColorStop(0.3, 'rgba(200,255,235,0.15)');
		r.addColorStop(1, 'rgba(255,255,255,0)');
		g.fillStyle = r;
		g.fillRect(0, 0, 128, 128);
		g.fillStyle = 'rgba(255,255,255,0.9)';
		g.beginPath();
		g.moveTo(64, 0); g.lineTo(68, 60); g.lineTo(128, 64); g.lineTo(68, 68); g.lineTo(64, 128); g.lineTo(60, 68); g.lineTo(0, 64); g.lineTo(60, 60);
		g.closePath();
		g.fill();
		return new THREE.CanvasTexture(c);
	})();
	const discSide = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 1, roughness: 0.18, envMap, envMapIntensity: 0.8 });

	const rigs: CaseRig[] = [];
	const n = cds.length;
	const rowW = n * CD + (n - 1) * GAP;
	for (let i = 0; i < n; i++) {
		const cd = cds[i];
		const group = new THREE.Group();
		// tray (back) + back insert
		const tray = new THREE.Mesh(new THREE.BoxGeometry(CW, CH, TRAY), clearTray);
		tray.renderOrder = 3;
		tray.position.z = -CD / 2 + TRAY / 2;
		group.add(tray);
		const back = new THREE.Mesh(new THREE.PlaneGeometry(CW - 2, CH - 2), new THREE.MeshStandardMaterial({ map: tex(backArt(cd, i)), roughness: 0.6 }));
		back.position.z = -CD / 2 - 0.05;
		back.rotation.y = Math.PI;
		group.add(back);
		// spine strip (left edge, full depth)
		const spine = new THREE.Mesh(new THREE.PlaneGeometry(CD, CH), new THREE.MeshStandardMaterial({ map: tex(spineArt(cd, i)), roughness: 0.5 }));
		spine.position.x = -CW / 2 - 0.05;
		spine.rotation.y = -Math.PI / 2;
		group.add(spine);
		// disc on the tray
		const label = new THREE.MeshStandardMaterial({ map: tex(discArt(cd, i)), metalness: 0.35, roughness: 0.3, envMap, envMapIntensity: 0.5 });
		const discMats = [discSide, label, discSide];
		const disc = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 1.2, 96), discMats);
		disc.rotation.x = Math.PI / 2;
		disc.position.set(3, 0, -CD / 2 + TRAY + 0.7);
		group.add(disc);
		// lid on a hinge at the spine edge: clear plastic only
		const lidPivot = new THREE.Group();
		lidPivot.position.set(-CW / 2, 0, CD / 2 - LID / 2);
		group.add(lidPivot);
		const lid = new THREE.Mesh(new THREE.BoxGeometry(CW, CH, LID), clear);
		lid.position.x = CW / 2;
		lid.renderOrder = 4;
		lidPivot.add(lid);
		const glareMap = glareTex.clone();
		glareMap.wrapS = glareMap.wrapT = THREE.ClampToEdgeWrapping;
		const glare = new THREE.Mesh(
			new THREE.PlaneGeometry(CW, CH),
			new THREE.MeshBasicMaterial({ map: glareMap, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 }),
		);
		glare.position.set(CW / 2, 0, LID / 2 + 0.06);
		glare.renderOrder = 6;
		lidPivot.add(glare);
		const sparkles = Array.from({ length: 14 }, (_, k) => {
			const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
			const h = (a: number) => (Math.sin((i + 1) * 91.7 + k * 13.3 + a) * 43758.5453) % 1;
			s.position.set(CW / 2 + Math.abs(h(1)) * CW * 0.92 - CW * 0.46, Math.abs(h(2)) * CH * 0.92 - CH * 0.46, LID / 2 + 0.4);
			s.renderOrder = 7;
			lidPivot.add(s);
			return { s, phase: Math.abs(h(3)) * 20, rate: 1.4 + Math.abs(h(4)) * 2.4, size: 5 + Math.abs(h(5)) * 7 };
		});
		// the cover is printed on the disc
		loadCover(cd, i).then((c) => {
			label.map = tex(pictureDisc(c));
			label.needsUpdate = true;
		});
		// standing on the shelf, spine to camera
		const x = -rowW / 2 + CD / 2 + i * (CD + GAP);
		const shelfPos = new THREE.Vector3(x, SHELF_Y + CH / 2, 0);
		const shelfRotY = Math.PI / 2 + (Math.sin(i * 12.9) * 0.025);
		group.position.copy(shelfPos);
		group.rotation.y = shelfRotY;
		scene.add(group);
		rigs.push({ group, lidPivot, disc, shelfPos, shelfRotY, pull: 0, open: 0, discLift: 0, discSpin: DISC_UP + i * 1.3, hit: [tray, lid, spine, back, disc], glare, sparkles });
	}
	bookend.position.set(rowW / 2 + 8, SHELF_Y + 40, 0);

	// ── state ─────────────────────────────────────────────────────────────
	let mode: Mode = 'shelf';
	let hover = -1;
	let sel = -1;
	let selK = 0; // 0 on shelf → 1 inspecting
	let yaw = 0, pitch = 0.08, vYaw = 0, vPitch = 0;
	let wantOpen = false;
	// opening plays as one move: a full turn while the lid swings flat
	let openAnim: { t0: number; from: number; to: number; opening: boolean } | null = null;
	let clock = 0;
	const OPEN_DUR = 1.35, CLOSE_DUR = 0.6;
	const raycaster = new THREE.Raycaster();
	const ndc = new THREE.Vector2();
	const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

	const pick = (e: PointerEvent): number => {
		const r = canvas.getBoundingClientRect();
		ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
		raycaster.setFromCamera(ndc, camera);
		const hits = raycaster.intersectObjects(rigs.flatMap((rg) => rg.hit), false);
		if (!hits.length) return -1;
		return rigs.findIndex((rg) => rg.hit.includes(hits[0].object));
	};

	const setLabel = (i: number) => {
		if (i < 0) { ui.label.hidden = true; return; }
		const cd = cds[i];
		ui.label.hidden = false;
		ui.label.innerHTML = `<b>${cd.title}</b><span>${cd.artist}${cd.year ? ` · ${cd.year}` : ''}</span>`;
	};
	let shownOpen = false;
	const setHint = () => {
		host.dataset.mode = mode;
		const isOpen = mode === 'inspect' && wantOpen;
		if (isOpen !== shownOpen) { shownOpen = isOpen; ui.onOpen?.(sel, isOpen); }
		ui.hint.textContent = mode === 'shelf' ? '> pick a cd off the shelf' : wantOpen ? '> drag to turn  //  tap to close' : '> drag to turn  //  tap to open';
		ui.back.hidden = mode === 'shelf';
	};

	function select(i: number) {
		sel = i;
		mode = 'inspect';
		yaw = 0.35; pitch = 0.1; vYaw = 0; vPitch = 0;
		wantOpen = false;
		openAnim = null;
		setLabel(i);
		setHint();
	}
	function release() {
		mode = 'shelf';
		wantOpen = false;
		setLabel(-1);
		setHint();
	}
	ui.back.addEventListener('click', release);
	addEventListener('keydown', (e) => { if (e.key === 'Escape' && mode === 'inspect') release(); });

	// pointer: hover / tap / drag
	let down: { x: number; y: number; t: number; id: number } | null = null;
	let last = { x: 0, y: 0 };
	canvas.addEventListener('pointerdown', (e) => {
		down = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
		last = { x: e.clientX, y: e.clientY };
		if (mode === 'inspect' && e.pointerType !== 'touch') canvas.setPointerCapture(e.pointerId);
	});
	canvas.addEventListener('pointermove', (e) => {
		if (down && mode === 'inspect') {
			const dx = e.clientX - last.x, dy = e.clientY - last.y;
			last = { x: e.clientX, y: e.clientY };
			if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 6) {
				openAnim = null;
				vYaw = dx * 0.012;
				vPitch = dy * 0.008;
				yaw += vYaw;
				pitch = Math.max(-0.7, Math.min(0.7, pitch + vPitch));
			}
			return;
		}
		if (mode === 'shelf') {
			const i = pick(e);
			if (i !== hover) { hover = i; setLabel(i); }
			canvas.style.cursor = i >= 0 ? 'pointer' : '';
		} else canvas.style.cursor = 'grab';
	});
	canvas.addEventListener('pointerup', (e) => {
		if (!down) return;
		const moved = Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y);
		const tap = moved < 6 && performance.now() - down.t < 450;
		down = null;
		if (!tap) return;
		const i = pick(e);
		if (mode === 'shelf') { if (i >= 0) select(i); }
		else if (i === sel) {
			wantOpen = !wantOpen;
			const TAU = Math.PI * 2;
			// land square to the camera after one full extra turn when opening
			const to = wantOpen ? Math.ceil(yaw / TAU) * TAU + TAU : Math.round(yaw / TAU) * TAU + 0.35;
			openAnim = { t0: clock, from: yaw, to, opening: wantOpen };
			vYaw = 0; vPitch = 0;
			setHint();
		}
		else release();
	});
	canvas.addEventListener('pointerleave', () => { if (mode === 'shelf') { hover = -1; setLabel(-1); } });

	// ── frame ─────────────────────────────────────────────────────────────
	const inspectPos = new THREE.Vector3(0, 68, 150);
	// wide screens centre the open case on its hinge; phones centre the disc
	// (tray) and let the lid run off to the left
	let hingeCentre = 1;
	const tmp = new THREE.Vector3();
	const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
	const damp = (a: number, b: number, l: number, dt: number) => a + (b - a) * (1 - Math.exp(-l * dt));

	function resize() {
		const w = host.clientWidth, h = host.clientHeight;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		// keep the shelf framed on tall phones
		camera.fov = w / h < 0.8 ? 48 : w / h < 1.2 ? 40 : 32;
		hingeCentre = Math.max(0, Math.min(1, (w / h - 0.8) / 0.4));
		camera.updateProjectionMatrix();
	}
	new ResizeObserver(resize).observe(host);
	resize();

	let visible = true;
	new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(host);
	let prev = performance.now();
	const t0 = prev;

	function frame(now: number) {
		requestAnimationFrame(frame);
		if (!visible) { prev = now; return; }
		const dt = Math.min(0.05, (now - prev) / 1000);
		prev = now;
		const t = (now - t0) / 1000;
		clock = t;
		let animOpen = -1;
		if (openAnim) {
			const k = Math.min(1, (t - openAnim.t0) / (openAnim.opening ? OPEN_DUR : CLOSE_DUR));
			const e = ease(k);
			yaw = openAnim.from + (openAnim.to - openAnim.from) * e;
			pitch += (0.06 - pitch) * 0.1;
			animOpen = openAnim.opening ? ease(Math.max(0, (k - 0.15) / 0.85)) : 1 - e;
			if (k >= 1) openAnim = null;
		}

		selK = damp(selK, mode === 'inspect' ? 1 : 0, reduce ? 30 : 5, dt);
		if (mode === 'inspect' && !down) { yaw += vYaw; pitch = Math.max(-0.7, Math.min(0.7, pitch + vPitch)); vYaw *= 0.92; vPitch *= 0.9; }
		if (mode === 'inspect' && !down && !openAnim && Math.abs(vYaw) < 0.0005 && !wantOpen) yaw += Math.sin(t * 0.6) * 0.0008;

		rigs.forEach((rg, i) => {
			rg.pull = damp(rg.pull, mode === 'shelf' && hover === i ? 1 : 0, 10, dt);
			const isSel = i === sel;
			const k = isSel ? ease(Math.min(1, selK)) : 0;
			// shelf pose (with hover pull-out) → inspect pose
			tmp.copy(rg.shelfPos).add(new THREE.Vector3(0, rg.pull * 3, rg.pull * 22));
			if (isSel) {
				// lift up out of the row before swinging to the front
				const arc = Math.sin(k * Math.PI) * 40;
				// open flat: slide along local x so the hinge (or, on phones, the disc) is centred
				const slide = rg.open * (CW / 2) * hingeCentre;
				rg.group.position.set(
					tmp.x + (inspectPos.x + slide * Math.cos(yaw) - tmp.x) * k,
					tmp.y + (inspectPos.y - tmp.y) * k + arc,
					tmp.z + (inspectPos.z - slide * Math.sin(yaw) - tmp.z) * k,
				);
				rg.group.rotation.set(pitch * k, rg.shelfRotY + (yaw - rg.shelfRotY) * k, 0);
			} else {
				rg.group.position.copy(tmp);
				rg.group.rotation.set(0, rg.shelfRotY, 0);
			}
			// lid + disc
			if (isSel && animOpen >= 0) rg.open = animOpen;
			else rg.open = damp(rg.open, isSel && wantOpen && selK > 0.9 ? 1 : 0, 6, dt);
			rg.lidPivot.rotation.y = -rg.open * Math.PI; // flat open, like a book
			rg.discLift = damp(rg.discLift, rg.open > 0.7 ? 1 : 0, 4, dt);
			// always turning, faster once the case is open
			rg.discSpin += dt * (reduce ? 0 : 0.9 + rg.discLift * 2.6);
			rg.disc.position.z = -CD / 2 + TRAY + 0.7 + rg.discLift * 3;
			rg.disc.rotation.y = rg.discSpin;
			// the streak slides across as the case turns or tilts
			const turn = isSel ? yaw + pitch * 0.6 : rg.shelfRotY + rg.pull * 0.4;
			const gm = rg.glare.material as THREE.MeshBasicMaterial;
			gm.map!.offset.set(Math.sin(turn * 1.3) * 0.75, Math.sin(turn * 0.7 + 0.4) * 0.12);
			gm.opacity = (isSel ? 0.55 : 0.22) * (0.55 + 0.45 * Math.abs(Math.cos(turn)));
			// glints: brief and sharp, catching more while it moves
			const motion = isSel ? Math.min(1, Math.abs(vYaw) * 30 + (openAnim ? 0.8 : 0)) : 0;
			for (const sp of rg.sparkles) {
				const w = Math.max(0, Math.sin(t * sp.rate + sp.phase + turn * 3));
				const a = Math.pow(w, 14) * (isSel ? 0.9 : 0.35) + motion * Math.pow(w, 6) * 0.5;
				(sp.s.material as THREE.SpriteMaterial).opacity = reduce ? 0 : a;
				const sz = sp.size * (0.6 + 0.6 * w);
				sp.s.scale.set(sz, sz, 1);
			}
		});

		// camera eases in a little while inspecting, with a slow drift
		camera.position.set(camHome.x + Math.sin(t * 0.25) * 6 * (1 - selK), camHome.y - selK * 26, camHome.z + selK * 150);
		camera.lookAt(lookHome.x, lookHome.y + selK * 6, lookHome.z + selK * 110);
		renderer.render(scene, camera);
	}
	setHint();
	requestAnimationFrame(frame);
}

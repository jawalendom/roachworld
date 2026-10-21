// The CD shelf: five jewel cases standing spine-out on a shelf. Hover pulls a
// case out a little; click takes it off the shelf and turns it to face you;
// drag turns it; tap opens the hinged lid and the disc lifts and spins.
// Units are millimetres (a jewel case is 142 × 125 × 10.4).

import * as THREE from 'three';
import { fontsReady } from '../pretext/fonts';
import { coverArt, spineArt, backArt, discArt, type Cd } from './art';

const CW = 142, CH = 125, CD = 10.4; // case width, height, depth
const TRAY = 7.4, LID = 2.6;
const SHELF_Y = 0;
const GAP = 3.2;

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
}

export interface ShelfUi {
	label: HTMLElement; // hover/selected title
	hint: HTMLElement;
	back: HTMLButtonElement;
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
	const camera = new THREE.PerspectiveCamera(32, 1, 1, 2000);
	const camHome = new THREE.Vector3(0, 120, 560);
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
	const wood = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.85 });
	const plank = new THREE.Mesh(new THREE.BoxGeometry(320, 8, 170), wood);
	plank.position.set(0, SHELF_Y - 4, 0);
	scene.add(plank);
	const edge = new THREE.Mesh(new THREE.BoxGeometry(300, 1.2, 0.6), new THREE.MeshBasicMaterial({ color: 0x00ff9c }));
	edge.position.set(0, SHELF_Y - 0.6, 85.4);
	scene.add(edge);
	const wall = new THREE.Mesh(new THREE.PlaneGeometry(900, 500), new THREE.MeshStandardMaterial({ color: 0x0a0a0d, roughness: 1 }));
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

	const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0e, roughness: 0.45, metalness: 0.1 });
	const clear = new THREE.MeshPhysicalMaterial({
		color: 0xffffff, transparent: true, opacity: 0.16, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false,
	});
	const discSide = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, metalness: 1, roughness: 0.18 });

	const rigs: CaseRig[] = [];
	const n = cds.length;
	const rowW = n * CD + (n - 1) * GAP;
	for (let i = 0; i < n; i++) {
		const cd = cds[i];
		const group = new THREE.Group();
		// tray (back) + back insert
		const tray = new THREE.Mesh(new THREE.BoxGeometry(CW, CH, TRAY), black);
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
		const discMats = [discSide, new THREE.MeshStandardMaterial({ map: tex(discArt(cd, i)), metalness: 0.5, roughness: 0.28 }), discSide];
		const disc = new THREE.Mesh(new THREE.CylinderGeometry(60, 60, 1.2, 96), discMats);
		disc.rotation.x = Math.PI / 2;
		disc.position.set(3, 0, -CD / 2 + TRAY + 0.7);
		group.add(disc);
		// lid on a hinge at the spine edge: booklet behind clear plastic
		const lidPivot = new THREE.Group();
		lidPivot.position.set(-CW / 2, 0, CD / 2 - LID / 2);
		group.add(lidPivot);
		const lid = new THREE.Mesh(new THREE.BoxGeometry(CW, CH, LID), clear);
		lid.position.x = CW / 2;
		lid.renderOrder = 2;
		lidPivot.add(lid);
		const booklet = new THREE.Mesh(new THREE.PlaneGeometry(CW - 4, CH - 3), new THREE.MeshStandardMaterial({ roughness: 0.55 }));
		booklet.position.set(CW / 2 + 1, 0, -0.2);
		lidPivot.add(booklet);
		// inside of the booklet, seen when the case is open
		const inner = new THREE.Mesh(new THREE.PlaneGeometry(CW - 4, CH - 3), new THREE.MeshStandardMaterial({ map: tex(backArt(cd, i)), roughness: 0.6 }));
		inner.position.set(CW / 2 + 1, 0, -0.35);
		inner.rotation.y = Math.PI;
		lidPivot.add(inner);
		loadCover(cd, i).then((c) => {
			(booklet.material as THREE.MeshStandardMaterial).map = tex(c);
			(booklet.material as THREE.MeshStandardMaterial).needsUpdate = true;
		});
		// standing on the shelf, spine to camera
		const x = -rowW / 2 + CD / 2 + i * (CD + GAP);
		const shelfPos = new THREE.Vector3(x, SHELF_Y + CH / 2, 0);
		const shelfRotY = Math.PI / 2 + (Math.sin(i * 12.9) * 0.025);
		group.position.copy(shelfPos);
		group.rotation.y = shelfRotY;
		scene.add(group);
		rigs.push({ group, lidPivot, disc, shelfPos, shelfRotY, pull: 0, open: 0, discLift: 0, discSpin: 0, hit: [tray, lid, spine, back, booklet, inner, disc] });
	}
	bookend.position.set(rowW / 2 + 8, SHELF_Y + 40, 0);

	// ── state ─────────────────────────────────────────────────────────────
	let mode: Mode = 'shelf';
	let hover = -1;
	let sel = -1;
	let selK = 0; // 0 on shelf → 1 inspecting
	let yaw = 0, pitch = 0.08, vYaw = 0, vPitch = 0;
	let wantOpen = false;
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
	const setHint = () => {
		host.dataset.mode = mode;
		ui.hint.textContent = mode === 'shelf' ? '> pick a cd off the shelf' : wantOpen ? '> drag to turn  //  tap to close' : '> drag to turn  //  tap to open';
		ui.back.hidden = mode === 'shelf';
	};

	function select(i: number) {
		sel = i;
		mode = 'inspect';
		yaw = 0.35; pitch = 0.1; vYaw = 0; vPitch = 0;
		wantOpen = false;
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
		else if (i === sel) { wantOpen = !wantOpen; setHint(); }
		else release();
	});
	canvas.addEventListener('pointerleave', () => { if (mode === 'shelf') { hover = -1; setLabel(-1); } });

	// ── frame ─────────────────────────────────────────────────────────────
	const inspectPos = new THREE.Vector3(0, 68, 165);
	const tmp = new THREE.Vector3();
	const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
	const damp = (a: number, b: number, l: number, dt: number) => a + (b - a) * (1 - Math.exp(-l * dt));

	function resize() {
		const w = host.clientWidth, h = host.clientHeight;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		// keep the shelf framed on tall phones
		camera.fov = w / h < 0.8 ? 48 : w / h < 1.2 ? 40 : 32;
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

		selK = damp(selK, mode === 'inspect' ? 1 : 0, reduce ? 30 : 5, dt);
		if (mode === 'inspect' && !down) { yaw += vYaw; pitch = Math.max(-0.7, Math.min(0.7, pitch + vPitch)); vYaw *= 0.92; vPitch *= 0.9; }
		if (mode === 'inspect' && !down && Math.abs(vYaw) < 0.0005 && !wantOpen) yaw += Math.sin(t * 0.6) * 0.0008;

		rigs.forEach((rg, i) => {
			rg.pull = damp(rg.pull, mode === 'shelf' && hover === i ? 1 : 0, 10, dt);
			const isSel = i === sel;
			const k = isSel ? ease(Math.min(1, selK)) : 0;
			// shelf pose (with hover pull-out) → inspect pose
			tmp.copy(rg.shelfPos).add(new THREE.Vector3(0, rg.pull * 3, rg.pull * 22));
			if (isSel) {
				// lift up out of the row before swinging to the front
				const arc = Math.sin(k * Math.PI) * 40;
				const slide = ease(rg.open) * 55 * Math.cos(yaw); // keep the open case centred
				rg.group.position.set(
					tmp.x + (inspectPos.x + slide - tmp.x) * k,
					tmp.y + (inspectPos.y - tmp.y) * k + arc,
					tmp.z + (inspectPos.z - tmp.z) * k,
				);
				rg.group.rotation.set(pitch * k, rg.shelfRotY + (yaw - rg.shelfRotY) * k, 0);
			} else {
				rg.group.position.copy(tmp);
				rg.group.rotation.set(0, rg.shelfRotY, 0);
			}
			// lid + disc
			rg.open = damp(rg.open, isSel && wantOpen && selK > 0.9 ? 1 : 0, 6, dt);
			rg.lidPivot.rotation.y = -ease(rg.open) * 1.75;
			rg.discLift = damp(rg.discLift, rg.open > 0.7 ? 1 : 0, 4, dt);
			rg.discSpin += dt * (0.4 + rg.discLift * 3.2) * (rg.open > 0.05 ? 1 : 0);
			rg.disc.position.z = -CD / 2 + TRAY + 0.7 + rg.discLift * 7;
			rg.disc.rotation.y = rg.discSpin;
		});

		// camera eases in a little while inspecting, with a slow drift
		camera.position.set(camHome.x + Math.sin(t * 0.25) * 8 * (1 - selK), camHome.y - selK * 45, camHome.z - selK * 30);
		camera.lookAt(lookHome.x, lookHome.y + selK * 8, lookHome.z + selK * 150);
		renderer.render(scene, camera);
	}
	setHint();
	requestAnimationFrame(frame);
}

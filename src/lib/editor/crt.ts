// Curved-glass CRT: re-draws the sheet's 2D canvas through a WebGL barrel
// distortion so the picture bulges out like an old tube — edges bow away,
// slight colour fringing toward the rim, vignette — and frames the viewport in
// a rounded bezel. The 2D canvas stays in place (invisible) for hit-testing;
// `toSource` maps a point on the curved glass back to the flat canvas.

export interface CrtOpts {
	/** barrel strength; ~0.06–0.1 reads as an old TV without hurting text */
	curve?: number;
}

export interface Crt {
	resize(pxW: number, pxH: number): void;
	draw(): void;
	/** viewport-relative point on the glass → point on the flat sheet canvas */
	toSource(x: number, y: number, w: number, h: number): [number, number] | null;
}

const VERT = `
attribute vec2 p;
varying vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision mediump float;
uniform sampler2D tex;
uniform float k;
uniform vec2 res;
varying vec2 uv;
vec2 bend(vec2 u, float kk) {
	vec2 c = u * 2.0 - 1.0;
	c *= 1.0 + kk * vec2(c.y * c.y, c.x * c.x);
	return c * 0.5 + 0.5;
}
float inside(vec2 u) { return step(0.0, u.x) * step(u.x, 1.0) * step(0.0, u.y) * step(u.y, 1.0); }
void main() {
	vec2 q = vec2(uv.x, 1.0 - uv.y);
	// colour fringe: red bends a touch more, blue a touch less
	vec2 ur = bend(q, k * 1.04), ug = bend(q, k), ub = bend(q, k * 0.96);
	vec3 col = vec3(texture2D(tex, ur).r * inside(ur), texture2D(tex, ug).g * inside(ug), texture2D(tex, ub).b * inside(ub));
	// vignette toward the curved rim
	vec2 c = ug * 2.0 - 1.0;
	float v = 1.0 - 0.38 * pow(dot(c * vec2(0.85, 1.0), c * vec2(0.85, 1.0)), 1.4);
	col *= clamp(v, 0.0, 1.0);
	// soft glass highlight, top left
	float hl = smoothstep(0.75, 0.0, length((q - vec2(0.22, 0.12)) * vec2(1.0, 1.6)));
	col += vec3(0.035) * hl;
	gl_FragColor = vec4(col, 1.0);
}`;

export function makeCrt(root: HTMLElement, source: HTMLCanvasElement, o: CrtOpts = {}): Crt | null {
	const k = o.curve ?? 0.08;
	const glc = document.createElement('canvas');
	const gl = glc.getContext('webgl', { premultipliedAlpha: false, antialias: false });
	if (!gl) return null; // no WebGL: leave the flat canvas showing

	const sh = (type: number, src: string) => {
		const s = gl.createShader(type)!;
		gl.shaderSource(s, src);
		gl.compileShader(s);
		return s;
	};
	const prog = gl.createProgram()!;
	gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
	gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
	gl.linkProgram(prog);
	if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
	gl.useProgram(prog);
	const buf = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, buf);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
	const loc = gl.getAttribLocation(prog, 'p');
	gl.enableVertexAttribArray(loc);
	gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
	const tex = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, tex);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.uniform1f(gl.getUniformLocation(prog, 'k'), k);
	const resLoc = gl.getUniformLocation(prog, 'res');

	// the glass sits exactly over the flat canvas; the flat one goes invisible
	// but keeps receiving pointer events
	glc.setAttribute('aria-hidden', 'true');
	Object.assign(glc.style, {
		position: 'sticky',
		top: '0',
		display: 'block',
		width: '100vw',
		height: '100vh',
		marginLeft: 'calc(50% - 50vw)',
		marginTop: '-100vh',
		pointerEvents: 'none',
	});
	source.after(glc);
	source.style.opacity = '0';
	root.dataset.crt = '';

	// rounded bezel over the whole viewport, chrome included
	const bezel = document.createElement('div');
	bezel.setAttribute('aria-hidden', 'true');
	Object.assign(bezel.style, {
		position: 'fixed',
		inset: '0',
		zIndex: '70',
		pointerEvents: 'none',
		borderRadius: 'clamp(18px, 4.5vw, 54px) / clamp(16px, 4vw, 46px)',
		boxShadow: '0 0 0 200px #000, inset 0 0 clamp(40px, 9vw, 140px) rgba(0,0,0,0.7), inset 0 0 0 2px rgba(230,230,233,0.05)',
	});
	document.body.appendChild(bezel);

	return {
		resize(pxW, pxH) {
			glc.width = pxW;
			glc.height = pxH;
			gl.viewport(0, 0, pxW, pxH);
			gl.uniform2f(resLoc, pxW, pxH);
		},
		draw() {
			gl.bindTexture(gl.TEXTURE_2D, tex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		},
		toSource(x, y, w, h) {
			let cx = (x / w) * 2 - 1;
			let cy = (y / h) * 2 - 1;
			const bx = cx * (1 + k * cy * cy);
			const by = cy * (1 + k * cx * cx);
			if (bx < -1 || bx > 1 || by < -1 || by > 1) return null;
			return [((bx + 1) / 2) * w, ((by + 1) / 2) * h];
		},
	};
}

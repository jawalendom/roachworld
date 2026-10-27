// Draws a character grid in one WebGL pass. Each frame uploads a tiny texture,
// one texel per cell (R = glyph, G = ink, B = opacity), and a fragment shader
// looks each screen pixel's cell up in a glyph atlas. Tens of thousands of
// characters cost the same as a handful — the 2D canvas path does them one by one.

const VERT = `
attribute vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D cells;
uniform sampler2D atlas;
uniform vec2 grid;      // cols, rows
uniform vec2 cellPx;    // one cell, device px
uniform vec2 atlasGrid; // glyphs, inks
uniform float height;   // canvas height, device px
uniform vec3 bg;
uniform float lineGap;  // background grid spacing, device px (0 = none)
uniform float lineW;    // its line width, device px
uniform vec3 lineCol;
void main() {
	vec2 p = vec2(gl_FragCoord.x, height - gl_FragCoord.y);
	vec2 cell = floor(p / cellPx);
	vec4 c = texture2D(cells, (cell + 0.5) / grid);
	vec3 col = bg;
	// a fixed grey grid behind the characters: screen-space, so zooming the
	// characters never resizes it
	if (lineGap > 0.0) {
		vec2 m = mod(p, lineGap);
		if (min(m.x, m.y) < lineW) col = lineCol;
	}
	vec3 under = col;
	if (c.b > 0.0) {
		vec2 f = (p - cell * cellPx) / cellPx;
		vec2 at = (vec2(floor(c.r * 255.0 + 0.5), floor(c.g * 255.0 + 0.5)) + f) / atlasGrid;
		vec4 a = texture2D(atlas, at);
		col = mix(under, a.rgb, a.a * c.b);
	}
	gl_FragColor = vec4(col, 1.0);
}`;

export interface GlGrid {
	setAtlas(atlas: HTMLCanvasElement, glyphs: number, inks: number): void;
	/** background grid: spacing and line width in device px, 0–1 rgb */
	setLines(gap: number, width: number, rgb: [number, number, number]): void;
	draw(cells: Uint8Array, cols: number, rows: number, cellW: number, cellH: number): void;
}

export function makeGlGrid(canvas: HTMLCanvasElement, bg: [number, number, number]): GlGrid | null {
	const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
	if (!gl) return null;
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

	const tex = (unit: number, filter: number) => {
		const t = gl.createTexture()!;
		gl.activeTexture(gl.TEXTURE0 + unit);
		gl.bindTexture(gl.TEXTURE_2D, t);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		return t;
	};
	const cellsTex = tex(0, gl.NEAREST);
	const atlasTex = tex(1, gl.LINEAR);
	const u = (n: string) => gl.getUniformLocation(prog, n);
	gl.uniform1i(u('cells'), 0);
	gl.uniform1i(u('atlas'), 1);
	gl.uniform3f(u('bg'), ...bg);
	gl.uniform1f(u('lineGap'), 0);
	gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

	return {
		setAtlas(atlas, glyphs, inks) {
			gl.activeTexture(gl.TEXTURE1);
			gl.bindTexture(gl.TEXTURE_2D, atlasTex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
			gl.uniform2f(u('atlasGrid'), glyphs, inks);
		},
		setLines(gap, width, rgb) {
			gl.uniform1f(u('lineGap'), gap);
			gl.uniform1f(u('lineW'), width);
			gl.uniform3f(u('lineCol'), ...rgb);
		},
		draw(cells, cols, rows, cellW, cellH) {
			gl.viewport(0, 0, canvas.width, canvas.height);
			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, cellsTex);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, cols, rows, 0, gl.RGB, gl.UNSIGNED_BYTE, cells);
			gl.uniform2f(u('grid'), cols, rows);
			gl.uniform2f(u('cellPx'), cellW, cellH);
			gl.uniform1f(u('height'), canvas.height);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		},
	};
}

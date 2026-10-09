// The editor view's glitch key — shared by the issue sheet and full-page pieces.
import { FONT } from '../pretext/fonts';
import type { Theme } from './compose';
import { glitchField, frameTear } from './glitch';
import type { MountOpts } from './sheet';

export const T: Theme = {
	ground: '#050506',
	ink: '#e6e6e9',
	dim: '#5f6068',
	accent: '#00ff9c',
	accent2: '#ff2e4d',
	display: FONT.display,
	body: FONT.body,
	mono: FONT.mono,
	hand: FONT.hand,
};
export const CYAN = '#13e8ff';

/** Animated background + full-frame tears for a sheet in this key. */
export const glitchLayers: Pick<MountOpts, 'background' | 'post'> = {
	background: (ctx, info) => glitchField(ctx, info, { colors: [T.accent, T.accent2, CYAN], glyph: T.accent, mono: T.mono }),
	post: frameTear,
};

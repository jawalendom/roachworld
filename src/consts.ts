// Global site data. Import from anywhere with `import { ... } from '../consts'`.

export const SITE_TITLE = 'ROACHWORLD';
export const SITE_DESCRIPTION =
	'A personal digital zine, set with pretext — a hand-rolled canvas typesetter.';

// Shown in the cover masthead / colophon.
export const EDITOR = 'Jordan Walendom';
export const FOUNDED = 2026;

export const NAV = [
	{ href: '/', label: 'Latest' },
	{ href: '/archive/', label: 'Archive' },
	{ href: '/colophon/', label: 'Colophon' },
];

// Risograph ink set. Kept here so the CSS design tokens and the canvas
// renderer draw from exactly the same values.
export const INK = {
	paper: '#F2EDE0',
	black: '#807D66',
	pink: '#FFEC4D', // acid yellow
	blue: '#4D5FFF', // medium blue
} as const;

export type InkName = keyof typeof INK;

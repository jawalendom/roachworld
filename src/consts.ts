// Global site data. Import from anywhere with `import { ... } from '../consts'`.

export const SITE_TITLE = 'ROACHWORLD';
export const SITE_DESCRIPTION =
	'A personal journal and magazine, set with pretext — a hand-rolled canvas typesetter.';

// Shown in the cover masthead / colophon.
export const EDITOR = 'Jordan Walendom';
export const FOUNDED = 2026;

export const NAV = [
	{ href: '/', label: 'Cover' },
	{ href: '/archive/', label: 'Archive' },
	{ href: '/colophon/', label: 'Colophon' },
	{ href: '/rss.xml', label: 'Feed' },
];

// Risograph ink set. Kept here so the CSS design tokens and the canvas
// renderer draw from exactly the same values.
export const INK = {
	paper: '#F2EDE0',
	black: '#22201C',
	pink: '#FF4D9E', // fluorescent pink
	blue: '#0E5AD6', // medium blue
} as const;

export type InkName = keyof typeof INK;

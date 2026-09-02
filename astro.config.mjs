// @ts-check
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig, fontProviders } from 'astro/config';

// ── Deployment ──────────────────────────────────────────────────────────────
// Set these for your GitHub Pages target.
//   • Project page  →  site: 'https://<user>.github.io', base: '/roachworld'
//   • User/org page →  site: 'https://<user>.github.io', base: '/'
//   • Custom domain →  site: 'https://roachworld.example', base: '/'
const site = 'https://jawalendom.github.io';
const base = '/roachworld';

// https://astro.build/config
export default defineConfig({
	site,
	base,
	trailingSlash: 'ignore',
	integrations: [mdx(), sitemap()],
	fonts: [
		{
			// Loud art-object display face — masthead, headlines, drop caps.
			provider: fontProviders.google(),
			name: 'Syne',
			cssVariable: '--font-display',
			weights: [600, 700, 800],
			fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
		},
		{
			// Plain, readable body — also what the canvas typesetter measures.
			provider: fontProviders.google(),
			name: 'Space Grotesk',
			cssVariable: '--font-body',
			weights: [400, 500, 700],
			fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
		},
		{
			// Folios, kickers, metadata.
			provider: fontProviders.google(),
			name: 'Space Mono',
			cssVariable: '--font-mono',
			weights: [400, 700],
			styles: ['normal', 'italic'],
			fallbacks: ['ui-monospace', 'monospace'],
		},
		{
			// The scrawl — handwritten margin notes.
			provider: fontProviders.google(),
			name: 'Caveat',
			cssVariable: '--font-hand',
			weights: [400, 700],
			fallbacks: ['ui-serif', 'cursive'],
		},
	],
});

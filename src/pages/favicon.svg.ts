// /favicon.svg — the roach for browser tabs, built from the same paths as
// <RoachMark>. Ink on light tabs, light on dark ones.
import { roachSvg } from '../lib/brand/roach';

export const GET = () =>
	new Response(
		roachSvg({
			square: true,
			fill: '#050506',
			style: '@media (prefers-color-scheme: dark) { svg { fill: #e6e6e9; } }',
		}),
		{ headers: { 'Content-Type': 'image/svg+xml' } },
	);

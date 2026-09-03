// pretext measures text with Canvas 2D `measureText`, which silently falls back
// to a system font if the requested family isn't loaded. Two consequences:
//   1. never typeset before the faces are resolved (`fontsReady`)
//   2. the family names must be the REAL ones. Astro's font provider renames
//      families to hashed strings (e.g. "Syne-9041051fb51cf271"), exposed only
//      through the --font-* CSS variables — so resolve those at runtime.

interface Families {
	display: string;
	body: string;
	mono: string;
	hand: string;
}

// Sensible defaults for SSR / pre-resolution; overwritten by resolveFamilies().
const families: Families = {
	display: "Syne",
	body: "Space Grotesk",
	mono: "Space Mono",
	hand: "Caveat",
};

function firstFamily(value: string): string {
	const token = value.split(',')[0]?.trim() ?? '';
	return token.replace(/^["']|["']$/g, '');
}

export function resolveFamilies(): void {
	if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return;
	const cs = getComputedStyle(document.documentElement);
	const d = firstFamily(cs.getPropertyValue('--font-display'));
	const b = firstFamily(cs.getPropertyValue('--font-body'));
	const m = firstFamily(cs.getPropertyValue("--font-mono"));
	const hn = firstFamily(cs.getPropertyValue("--font-hand"));
	if (d) families.display = d;
	if (b) families.body = b;
	if (m) families.mono = m;
	if (hn) families.hand = hn;
}

// CSS `font` shorthand builders — the only font descriptors handed to pretext.
export const FONT = {
	body: (px: number) => `400 ${px}px "${families.body}"`,
	bodyBold: (px: number) => `700 ${px}px "${families.body}"`,
	heading: (px: number) => `700 ${px}px "${families.display}"`,
	display: (px: number) => `800 ${px}px "${families.display}"`,
	dropCap: (px: number) => `800 ${px}px "${families.display}"`,
	kicker: (px: number) => `700 ${px}px "${families.mono}"`,
	caption: (px: number) => `400 ${px}px "${families.mono}"`,
	mono: (px: number) => `400 ${px}px "${families.mono}"`,
	monoBold: (px: number) => `700 ${px}px "${families.mono}"`,
	pullquote: (px: number) => `600 ${px}px "${families.display}"`,
	hand: (px: number) => `700 ${px}px "${families.hand}"`,
} as const;

let ready: Promise<void> | null = null;

export function fontsReady(): Promise<void> {
	if (ready) return ready;
	ready = (async () => {
		if (typeof document === 'undefined' || !('fonts' in document)) return;
		try {
			resolveFamilies();
			// Ask for each family explicitly so a face that nothing has painted yet
			// still gets fetched, then wait for the set to settle.
			await Promise.all([
				document.fonts.load(`400 16px "${families.body}"`),
				document.fonts.load(`700 16px "${families.body}"`),
				document.fonts.load(`700 16px "${families.display}"`),
				document.fonts.load(`800 16px "${families.display}"`),
				document.fonts.load(`400 16px "${families.mono}"`),
				document.fonts.load(`700 16px "${families.mono}"`),
				document.fonts.load(`700 16px "${families.hand}"`),
			]);
			await document.fonts.ready;
			resolveFamilies();
		} catch {
			/* degraded render beats a hang */
		}
	})();
	return ready;
}

export function onFontsChanged(cb: () => void): () => void {
	if (typeof document === 'undefined' || !('fonts' in document)) return () => {};
	const handler = () => cb();
	document.fonts.addEventListener('loadingdone', handler);
	return () => document.fonts.removeEventListener('loadingdone', handler);
}

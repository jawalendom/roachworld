// Bespoke editor-view components, one per issue folder. If an issue has no file
// yet, its editor view falls back to the plain layout.
const mods = import.meta.glob('../editors/*.astro', { eager: true });

export function editorFor(dir: string): any | null {
	return (mods[`../editors/${dir}.astro`] as any)?.default ?? null;
}

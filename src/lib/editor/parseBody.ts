// Turn an article's raw Markdown/MDX source into a flat block list the editor's
// canvas can ink. Inline <figure>/<Image> are dropped — the editor view uses the
// article's heroImage only.

export type Block =
	| { type: 'para'; text: string; /** set when the source uses hard line breaks (lyrics, verse) */ lines?: string[] }
	| { type: 'heading'; text: string }
	| { type: 'pull'; text: string; cite?: string }
	| { type: 'list'; items: string[] }
	| { type: 'rule' }
	/** `{/* read-more *\/}` — the issue page stops here and links to the full piece. */
	| { type: 'more' };

const stripInline = (s: string) =>
	s
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/\*([^*]+)\*/g, '$1')
		.replace(/`([^`]+)`/g, '$1')
		.replace(/<[^>]+>/g, '')
		.replace(/\s+/g, ' ')
		.trim();

export function parseBody(src: string): Block[] {
	// drop frontmatter + mdx imports/exports + jsx figure blocks
	let body = src.replace(/^---[\s\S]*?---\s*/, '');
	body = body.replace(/^\s*(import|export)\s.*$/gm, '');
	body = body.replace(/<figure[\s\S]*?<\/figure>/g, '');
	body = body.replace(/<Image[^>]*\/>/g, '');

	const blocks: Block[] = [];
	const chunks = body.split(/\n\s*\n/);

	for (const raw of chunks) {
		const chunk = raw.trim();
		if (!chunk) continue;

		if (/^#{2,4}\s+/.test(chunk)) {
			blocks.push({ type: 'heading', text: stripInline(chunk.replace(/^#+\s+/, '')) });
			continue;
		}
		if (/^\{\/\*\s*read-?more\s*\*\/\}$/i.test(chunk)) {
			blocks.push({ type: 'more' });
			continue;
		}
		if (/^-{3,}$/.test(chunk)) {
			blocks.push({ type: 'rule' });
			continue;
		}
		if (chunk.split('\n').every((l) => /^>/.test(l.trim()))) {
			const lines = chunk.split('\n').map((l) => l.replace(/^>\s?/, '').trim());
			let cite: string | undefined;
			const citeLine = lines[lines.length - 1];
			if (/^—|^-\s|^cite:/i.test(citeLine) || /<cite>/.test(chunk)) {
				cite = stripInline(lines.pop()!.replace(/^—\s?|^-\s?/, ''));
			}
			blocks.push({ type: 'pull', text: stripInline(lines.join(' ')), cite });
			continue;
		}
		if (/^[-*]\s+/.test(chunk.split('\n')[0].trim())) {
			// bullet lines start items; unindented wrapped lines continue the last one
			const items: string[] = [];
			for (const rawLine of chunk.split('\n')) {
				const l = rawLine.trim();
				if (!l) continue;
				if (/^[-*]\s+/.test(l)) items.push(l.replace(/^[-*]\s+/, ''));
				else if (items.length) items[items.length - 1] += ' ' + l;
			}
			blocks.push({ type: 'list', items: items.map(stripInline) });
			continue;
		}
		// a trailing `\` is a Markdown hard break — keep those lines apart
		if (/\\\n/.test(chunk)) {
			const lines = chunk.split(/\\\n/).map((l) => stripInline(l.replace(/\\$/, '')));
			blocks.push({ type: 'para', text: lines.join(' '), lines });
			continue;
		}
		blocks.push({ type: 'para', text: stripInline(chunk) });
	}
	return blocks;
}

/** First `n` lines of the body (lyrics previews), ending in a read-more marker. */
export function previewBlocks(blocks: Block[], n: number): Block[] {
	const out: Block[] = [];
	let left = n;
	for (const b of blocks) {
		if (left <= 0 || b.type !== 'para') break;
		const lines = b.lines ?? [b.text];
		const kept = lines.slice(0, left);
		out.push({ type: 'para', text: kept.join(' '), lines: kept });
		left -= kept.length;
	}
	out.push({ type: 'more' });
	return out;
}

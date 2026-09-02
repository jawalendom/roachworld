import { getCollection, type CollectionEntry } from 'astro:content';

export type ArticleEntry = CollectionEntry<'articles'>;
export type IssueEntry = CollectionEntry<'issues'>;

/**
 * Astro's glob loader slugifies ids, stripping the `.` from `01.fluorescent-pink`,
 * so the id looks like `02/01fluorescent-pink`. Peel the leading run number off.
 *   `02/01fluorescent-pink` → { dir: "02", order: 1, slug: "fluorescent-pink" }
 */
export function parseArticleId(id: string) {
	const [dir, rest = ''] = id.split('/');
	const m = rest.match(/^(\d+)[.\-_]?(.*)$/);
	const order = m ? Number.parseInt(m[1], 10) : 0;
	const slug = m ? m[2] : rest;
	return { dir, order, slug };
}

export const articleSlug = (a: ArticleEntry) => parseArticleId(a.id).slug;
export const articleOrder = (a: ArticleEntry) => parseArticleId(a.id).order;

export interface Issue {
	data: IssueEntry['data'];
	dir: string;
	articles: ArticleEntry[];
}

/** All issues, newest first, each with its articles in running order. */
export async function getIssues(): Promise<Issue[]> {
	const issues = await getCollection('issues');
	const articles = await getCollection('articles', ({ data }) => !data.draft);

	return issues
		.map((iss) => {
			const dir = iss.id.split('/')[0];
			return {
				data: iss.data,
				dir,
				articles: articles
					.filter((a) => parseArticleId(a.id).dir === dir)
					.sort((a, b) => articleOrder(a) - articleOrder(b)),
			};
		})
		.sort((a, b) => b.data.number - a.data.number);
}

export async function getLatestIssue(): Promise<Issue | undefined> {
	return (await getIssues())[0];
}

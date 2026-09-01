import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';

export async function GET(context) {
	const entries = (await getCollection('journal'))
		.filter((e) => !e.data.draft)
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
	const base = import.meta.env.BASE_URL.replace(/\/$/, '');
	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items: entries.map((entry) => ({
			title: `No. ${entry.data.issue} — ${entry.data.title}`,
			description: entry.data.dek,
			pubDate: entry.data.pubDate,
			link: `${base}/journal/${entry.id}/`,
		})),
	});
}

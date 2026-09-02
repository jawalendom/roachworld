import rss from '@astrojs/rss';
import { getIssues, articleSlug } from '../lib/issues';
import { SITE_DESCRIPTION, SITE_TITLE } from '../consts';

export async function GET(context) {
	const base = import.meta.env.BASE_URL.replace(/\/$/, '');
	const issues = await getIssues();

	const items = issues.flatMap((issue) =>
		issue.articles.map((article) => ({
			title: `No. ${issue.data.number} — ${article.data.title}`,
			description: article.data.dek,
			pubDate: article.data.pubDate,
			link: `${base}/issues/${issue.dir}/${articleSlug(article)}/`,
			categories: article.data.tags,
		})),
	);
	items.sort((a, b) => b.pubDate.valueOf() - a.pubDate.valueOf());

	return rss({
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		site: context.site,
		items,
	});
}

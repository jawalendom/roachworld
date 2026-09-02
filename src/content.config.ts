import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// An issue is a folder under src/content/issues/<NN>/ containing:
//   issue.yaml            — issue-level metadata
//   NN.<slug>.mdx         — one file per article, NN sets the running order

const issues = defineCollection({
	loader: glob({ base: './src/content/issues', pattern: '*/issue.{yaml,yml}' }),
	schema: z.object({
		number: z.number().int().positive(),
		title: z.string(),
		date: z.coerce.date(),
		blurb: z.string().optional(),
	}),
});

const articles = defineCollection({
	loader: glob({ base: './src/content/issues', pattern: '*/[0-9]*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			dek: z.string(),
			kicker: z.string().default('Article'),
			byline: z.string().default('Jordan Walendom'),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			tags: z.array(z.string()).default([]),
			draft: z.boolean().default(false),
		}),
});

export const collections = { issues, articles };

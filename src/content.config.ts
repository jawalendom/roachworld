import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

// One collection: `journal`. Each entry is an issue of the magazine.
const journal = defineCollection({
	loader: glob({ base: './src/content/journal', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			// Standfirst / deck — the paragraph under the headline.
			dek: z.string(),
			// Small category label above the headline, e.g. "FIELD NOTES".
			kicker: z.string().default('JOURNAL'),
			issue: z.number().int().positive(),
			pubDate: z.coerce.date(),
			updatedDate: z.coerce.date().optional(),
			byline: z.string().default('Jordan Walendom'),
			heroImage: z.optional(image()),
			tags: z.array(z.string()).default([]),
			draft: z.boolean().default(false),
		}),
});

export const collections = { journal };

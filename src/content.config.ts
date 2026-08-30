import { defineCollection, z } from 'astro:content';
import { googleSheetsPostsLoader } from './loaders/googleSheetsPostsLoader';

// Publish your Google Sheet as CSV (File → Share → Publish to web → CSV)
// and paste the URL here.
const POSTS_SHEET_URL = 'YOUR_GOOGLE_SHEET_CSV_URL_HERE';

const posts = defineCollection({
  loader: googleSheetsPostsLoader({ url: POSTS_SHEET_URL }),
  schema: z.object({
    title:       z.string(),
    description: z.string(),
    publishedAt: z.coerce.date(),
    image:       z.string().optional(),
    link:        z.string().url().optional(),
    tags:        z.array(z.string()).optional(),
    featured:    z.boolean().optional(),
    draft:       z.boolean().optional(),
  }),
});

export const collections = { posts };

import Papa from 'papaparse';
import { marked } from 'marked';
import type { Loader } from 'astro/loaders';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function isValidUrl(value: string): boolean {
  try { new URL(value); return true; } catch { return false; }
}

/**
 * Loads posts from a published Google Sheet CSV.
 *
 * Expected columns (case-sensitive):
 *   Title        — required; used as slug if no Slug column
 *   Slug         — optional; overrides auto-generated slug
 *   Description  — short summary shown in cards
 *   Body         — markdown content (supports standard markdown)
 *   Image URL    — optional; absolute URL or filename from /assets/
 *   Published At — date string (e.g. 2025-01-15)
 *   Tags         — comma-separated list
 *   Featured     — TRUE or YES to feature the post
 *   Draft        — TRUE or YES to hide in production, show in dev
 */
export function googleSheetsPostsLoader({ url }: { url: string }): Loader {
  return {
    name: 'google-sheets-posts-loader',
    load: async ({ store, logger }) => {
      logger.info('Fetching posts from Google Sheets...');

      let csv: string;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        csv = await res.text();
      } catch (err) {
        logger.error(`Failed to fetch Google Sheet: ${err}`);
        return;
      }

      const { data, errors } = Papa.parse<Record<string, string>>(csv, {
        header: true,
        skipEmptyLines: true,
      });

      if (errors.length) {
        logger.warn(`CSV parse warnings: ${errors.map((e) => e.message).join(', ')}`);
      }

      store.clear();
      let count = 0;

      for (const row of data) {
        const title = row['Title']?.trim();
        if (!title) continue;

        const slugRaw = row['Slug']?.trim();
        const id = slugRaw || slugify(title);

        const imageRaw = row['Image URL']?.trim();
        const image = imageRaw
          ? (imageRaw.startsWith('http') || imageRaw.startsWith('/'))
            ? imageRaw
            : `/assets/${imageRaw.split('/').pop()}`
          : undefined;

        const linkRaw = row['Link']?.trim();
        const link = linkRaw && isValidUrl(linkRaw) ? linkRaw : undefined;

        const tagsRaw = row['Tags']?.trim() ?? '';
        const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);

        const featuredRaw = row['Featured']?.trim().toUpperCase();
        const featured = featuredRaw === 'TRUE' || featuredRaw === 'YES' ? true : undefined;

        const draftRaw = row['Draft']?.trim().toUpperCase();
        const draft = draftRaw === 'TRUE' || draftRaw === 'YES' ? true : undefined;

        const publishedAtRaw = row['Published At']?.trim();
        const publishedAt = publishedAtRaw ? new Date(publishedAtRaw) : new Date();

        const body = row['Body']?.trim() ?? '';
        const html = await marked(body);

        store.set({
          id,
          data: {
            title,
            description: row['Description']?.trim() ?? '',
            publishedAt,
            image,
            link,
            tags: tags.length ? tags : undefined,
            featured,
            draft,
          },
          body,
          rendered: { html },
        });
        count++;
      }

      logger.info(`Loaded ${count} posts from Google Sheets.`);
    },
  };
}

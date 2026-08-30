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

/** Resolve a bare asset filename to /assets/blog/, leaving absolute URLs and root paths alone. */
function resolveBlogSrc(src: string): string {
  return /^(https?:\/\/|\/)/.test(src) ? src : `/assets/blog/${src}`;
}

/** Parse an HTML-ish attribute string into a map. Keys are lower-cased (attr names are case-insensitive). */
function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w-]+)\s*=\s*"([^"]*)"|([\w-]+)\s*=\s*'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrStr)) !== null) {
    if (m[1] !== undefined) attrs[m[1].toLowerCase()] = m[2];
    else attrs[m[3].toLowerCase()] = m[4];
  }
  return attrs;
}

/**
 * Rewrite <FloatImage> / <floatimage> tags in rendered HTML into a plain
 * <figure class="float-img"> with the same inline styles the Astro component
 * would emit. Handles self-closing and paired forms, case-insensitively.
 *
 * Attributes: src, alt, side (left|right|center), width, shape
 * (auto|circle|ellipse|<css shape>), shapeMargin, caption, rotation,
 * shadow ("opacity distance"), border ("width color").
 */
export function transformFloatImages(html: string): string {
  const re = /<floatimage\b([^>]*?)\/?>(?:[\s\S]*?<\/floatimage\s*>)?/gi;

  return html.replace(re, (_match, attrStr: string = '') => {
    const attrs = parseAttrs(attrStr);
    if (!attrs.src) return '';

    const src = resolveBlogSrc(attrs.src);
    const side =
      attrs.side === 'right' ? 'right' : attrs.side === 'center' ? 'center' : 'left';
    const isCentered = side === 'center';
    const alt = attrs.alt ?? '';

    const rawWidth = attrs.width ?? '260';
    const width = /^\d+$/.test(rawWidth) ? `${rawWidth}px` : rawWidth;

    const margin = isCentered
      ? '1.5rem auto'
      : side === 'left'
        ? '0 2rem 1.5rem 0'
        : '0 0 1.5rem 2rem';

    const floatStyle = isCentered
      ? 'float:none;clear:both;display:block;'
      : `float:${side};clear:${side};`;

    // shape-outside text wrap (skipped when centered — nothing wraps a centered figure)
    const shape = attrs.shape ?? 'auto';
    const shapeMargin = attrs.shapemargin ?? '1rem';
    let shapeStyle = '';
    if (!isCentered) {
      if (shape === 'auto') {
        shapeStyle = `shape-outside:url('${src}');shape-margin:${shapeMargin};`;
      } else if (shape === 'circle' || shape === 'ellipse') {
        shapeStyle = `shape-outside:${shape}();shape-margin:${shapeMargin};clip-path:${shape}();`;
      } else {
        // arbitrary CSS shape value, e.g. "polygon(0 0,100% 0,100% 100%)" or "inset(8px)"
        shapeStyle = `shape-outside:${shape};shape-margin:${shapeMargin};clip-path:${shape};`;
      }
    }

    const rotationStyle = attrs.rotation
      ? `transform:rotate(${attrs.rotation}deg);`
      : '';

    let shadowStyle = '';
    if (attrs.shadow) {
      const parts = attrs.shadow.trim().split(/\s+/);
      const opacity = parts[0] ?? '0.4';
      const dist = parseFloat(parts[1] ?? '8');
      shadowStyle = `box-shadow:0 ${dist}px ${dist * 2}px rgba(0,0,0,${opacity});`;
    }

    let borderStyle = '';
    if (attrs.border) {
      const b = attrs.border.trim();
      const spaceIdx = b.indexOf(' ');
      const bwRaw = spaceIdx === -1 ? b : b.slice(0, spaceIdx);
      const bColor = spaceIdx === -1 ? 'var(--color-border)' : b.slice(spaceIdx + 1).trim();
      const bw = /^\d+$/.test(bwRaw) ? `${bwRaw}px` : bwRaw;
      borderStyle = `border:${bw} solid ${bColor};border-radius:10px;overflow:hidden;`;
    }

    const figStyle =
      `${floatStyle}width:${width};margin:${margin};` +
      `${shapeStyle}${rotationStyle}${shadowStyle}${borderStyle}`;

    const img = `<img src="${src}" alt="${alt}" style="width:100%;border-radius:8px;display:block;">`;
    const cap = attrs.caption
      ? `<figcaption style="font-size:0.75rem;color:var(--color-muted);margin-top:0.5rem;font-family:monospace;">${attrs.caption}</figcaption>`
      : '';

    return `<figure class="float-img not-prose" data-side="${side}" style="${figStyle}">${img}${cap}</figure>`;
  });
}

/** Chain every body transform. Add one transform* function per custom component and call it here. */
export function transformBody(rawHtml: string): string {
  // Resolve bare markdown-image src (![alt](file.jpg)) to /assets/blog/
  const withImages = rawHtml.replace(
    /(<img[^>]+src=")(?!https?:\/\/|\/)/g,
    '$1/assets/blog/',
  );
  let out = transformFloatImages(withImages);
  // Unwrap paragraphs that marked wrapped around a lone float figure
  out = out.replace(
    /<p>\s*(<figure class="float-img[\s\S]*?<\/figure>)\s*<\/p>/g,
    '$1',
  );
  return out;
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
        const html = transformBody(await marked(body));

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

# Astro + Google Sheets Starter

A minimal static-site starter that uses **Google Sheets as a CMS**. Update your content in a spreadsheet; rebuild to publish. No database, no CMS subscription, no API key.

Built with [Astro 5](https://astro.build) + [Tailwind CSS v4](https://tailwindcss.com).

---

## Quick start

```bash
# 1. Use this template (GitHub) or clone it
git clone https://github.com/your-username/astro-sheets-starter my-site
cd my-site
npm install

# 2. Point it at your Google Sheet (see below)
# Edit src/content.config.ts and paste your CSV URL

# 3. Start the dev server
npm run dev
```

---

## Connecting your Google Sheet

1. Create a Google Sheet with these columns:

   | Column | Required | Notes |
   |--------|----------|-------|
   | Title | ✅ | Used to generate the URL slug |
   | Slug | | Override the auto-generated slug |
   | Description | | Short summary shown on cards |
   | Body | | Full post content — supports Markdown |
   | Image URL | | Absolute URL or filename from `public/assets/` |
   | Published At | | Date string e.g. `2025-01-15` |
   | Tags | | Comma-separated list |
   | Featured | | `TRUE` or `YES` to feature on the home page |
   | Draft | | `TRUE` or `YES` to hide in production |

2. Publish the sheet as CSV:
   **File → Share → Publish to web → Comma-separated values (.csv) → Publish**

3. Copy the URL and paste it into `src/content.config.ts`:
   ```ts
   const POSTS_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/…/pub?output=csv';
   ```

4. Run `npm run dev` — your posts appear immediately.

---

## Markdown editor

The starter ships with a split-pane markdown editor at `/editor` (dev only — excluded from production builds).

- Live preview as you type
- Toolbar buttons for headings, bold, italic, links, blockquotes, code blocks
- **Rating Heading** and **Float Image** component dialogs
- Copy Markdown button — paste straight into the Body cell of your Sheet
- Session-only drafts (content is lost on tab close, survives refresh)

---

## Customising the design

All colours and fonts live in `src/styles/global.css` as CSS custom properties:

```css
:root {
  --color-bg:      /* page background */
  --color-surface: /* card background */
  --color-accent:  /* brand colour — buttons, links, tags */
  --font-body:     /* body typeface */
  --font-mono:     /* monospace typeface */
}
```

Swap any value; every component inherits from these tokens automatically.

---

## Adding a new collection

1. Duplicate `src/loaders/googleSheetsPostsLoader.ts` and adjust the column names.
2. Add the new collection to `src/content.config.ts`.
3. Create a card component and the index/detail pages under `src/pages/`.

---

## Deploy

Works with any static host. One-click deploys:

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/your-username/astro-sheets-starter)

For auto-rebuilds when the sheet changes, use a [Netlify build hook](https://docs.netlify.com/configure-builds/build-hooks/) triggered from Google Apps Script or a cron service like [cron-job.org](https://cron-job.org).

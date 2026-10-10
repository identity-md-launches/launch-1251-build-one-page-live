import { defineConfig } from 'vite';

// Optional, public deployment URL. Runtime assets stay relative in either mode.
const siteUrl = process.env.SITE_URL;
const publicUrl = siteUrl ? new URL(siteUrl.endsWith('/') ? siteUrl : `${siteUrl}/`) : null;
if (publicUrl && !['https:', 'http:'].includes(publicUrl.protocol)) {
  throw new Error('SITE_URL must be an HTTP or HTTPS URL');
}
const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default defineConfig({
  base: './',
  build: { target: 'es2022' },
  plugins: [{
    name: 'public-share-url',
    transformIndexHtml(html) {
      if (!publicUrl) return html;
      return {
        html: html.replace('content="./og-image.png"', `content="${escapeAttribute(new URL('og-image.png', publicUrl).href)}"`),
        tags: [
          { tag: 'meta', attrs: { property: 'og:url', content: publicUrl.href }, injectTo: 'head' },
          { tag: 'link', attrs: { rel: 'canonical', href: publicUrl.href }, injectTo: 'head' },
        ],
      };
    },
  }],
});

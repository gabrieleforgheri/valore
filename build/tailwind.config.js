/**
 * Builds public/css/admin.css for the admin dashboard and the login page.
 *
 * These two templates used to pull cdn.tailwindcss.com at runtime, which is the
 * Play CDN: it compiles in the browser, is explicitly not meant for production,
 * and left the dashboard as an unstyled white page whenever the CDN could not
 * be reached from the container.
 *
 *   npm run build:css
 *
 * views/index.ejs is deliberately NOT scanned: the public page is styled by the
 * pre-compiled stylesheet in public/css/c6f658927172602e.css, which carries
 * class names (max-w-profileContainer, the @container variants) that come from
 * a different Tailwind configuration.
 */
module.exports = {
  content: ['./views/admin.ejs', './views/login.ejs'],
  theme: { extend: {} },
  plugins: []
};

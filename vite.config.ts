import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import fs from 'fs';
import { cpSync } from 'fs';

const rootDir = import.meta.dirname ?? process.cwd();

// Scan all root HTML files to dynamically create multi-page inputs
const htmlEntries = fs.readdirSync(rootDir)
  .filter(file => file.endsWith('.html'))
  .reduce<Record<string, string>>((acc, file) => {
    const key = file.replace(/\.html$/, '');
    acc[key] = resolve(rootDir, file);
    return acc;
  }, {});

// Set of known HTML pages (without extension) for fast lookup
const knownPages = new Set(Object.keys(htmlEntries));

/**
 * Vite plugin: copy extra static directories into dist after build.
 * Used to copy `posts/` and `Resources/` which are served at runtime
 * via fetch() but not referenced directly in HTML.
 */
function copyStaticDirsPlugin(): Plugin {
  return {
    name: 'copy-static-dirs',
    closeBundle() {
      const dirs = ['posts', 'Resources'];
      for (const dir of dirs) {
        const src = resolve(rootDir, dir);
        const dest = resolve(rootDir, 'dist', dir);
        if (fs.existsSync(src)) {
          cpSync(src, dest, { recursive: true });
          console.log(`✓ Copied ${dir}/ → dist/${dir}/`);
        }
      }
    },
  };
}

/**
 * Vite plugin: serve 404.html for any unmatched route in dev server,
 * mimicking GitHub Pages behavior.
 */
function fallback404Plugin(): Plugin {
  return {
    name: 'fallback-404',
    configureServer(server) {
      // Returning nothing = run BEFORE Vite's own middleware
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? '/';

        // Skip Vite internals, assets with extensions, and source files
        if (
          url.startsWith('/@') ||
          url.startsWith('/__') ||
          url.startsWith('/node_modules') ||
          url.startsWith('/src/') ||
          url.startsWith('/Resources/')
        ) {
          return next();
        }

        const urlPath = url.split('?')[0].split('#')[0];

        // Handle .html direct requests: if non-existent, serve 404.html
        if (urlPath.endsWith('.html')) {
          const pageKey = urlPath.replace(/^\//, '').replace(/\.html$/, '');
          if (!knownPages.has(pageKey)) {
            req.url = '/404.html';
          }
          return next();
        }

        // Other static assets (images, css, js, fonts, etc.)
        if (urlPath.includes('.')) {
          return next();
        }

        // Clean path: /about -> about, / -> index
        const cleanPath = urlPath.replace(/^\//, '').replace(/\/$/, '') || 'index';

        // Check if this matches a known HTML page
        if (knownPages.has(cleanPath)) {
          return next();
        }

        // Not a known page → rewrite to 404.html
        req.url = '/404.html';
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [fallback404Plugin(), copyStaticDirsPlugin()],
  appType: 'mpa',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: htmlEntries,
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
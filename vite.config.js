import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  define: {
    // Vite injects define values as raw source text, so they must be
    // JSON-stringified. Railway sets RAILWAY_GIT_COMMIT_SHA at build time;
    // local builds fall back to 'dev'.
    __APP_VERSION__: JSON.stringify(
      (process.env.RAILWAY_GIT_COMMIT_SHA || 'dev').slice(0, 7)
    ),
  },
  plugins: [
    react(),
    {
      name: 'local-fs-api',
      configureServer(server) {
        server.middlewares.use('/api/data', async (req, res, next) => {
          const fs = await import('fs/promises');
          const path = await import('path');
          // Resolves to fitness_data.json in the project root (where package.json is)
          const DATA_FILE = path.join(process.cwd(), 'fitness_data.json');

          if (req.method === 'GET') {
            try {
              const data = await fs.readFile(DATA_FILE, 'utf-8');
              res.setHeader('Content-Type', 'application/json');
              res.end(data);
            } catch (err) {
              if (err.code === 'ENOENT') {
                // File doesn't exist yet, return null/empty structure
                res.end(JSON.stringify(null));
              } else {
                console.error('Failed to read data file:', err);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Failed to read data file' }));
              }
            }
          } else if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });
            req.on('end', async () => {
              try {
                // Verify JSON is valid before writing
                JSON.parse(body);
                await fs.writeFile(DATA_FILE, body);
                res.end(JSON.stringify({ success: true }));
                console.log('Use Saved to fitness_data.json');
              } catch (err) {
                console.error('Failed to write data file:', err);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Failed to save data' }));
              }
            });
          } else {
            next();
          }
        });
      }
    },
    VitePWA({
      // Prompt-mode updates: UpdateBanner imports virtual:pwa-register/react,
      // which registers the SW itself — injectRegister null stops the plugin
      // from also injecting a registration script (double registration).
      registerType: 'prompt',
      injectRegister: null,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          }
        ]
      },
      manifest: false
    })
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          // Keep the heavy charting lib in its own chunk so it only loads on
          // the routes that use it (Analytics, Profile) rather than at startup.
          recharts: ['recharts'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
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
    }
  ],
  build: {
    outDir: 'dist',
  },
})

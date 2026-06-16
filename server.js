import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// __dirname is not defined in ES modules ("type": "module" in package.json),
// so derive it from import.meta.url.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the built static assets from dist/.
app.use(express.static(path.join(__dirname, 'dist')));

// SPA fallback: serve index.html for any unmatched route. The browser keeps the
// full URL (query params included) — unlike `serve --single`, which stripped
// them and broke the OAuth ?token=... handoff. A path-less app.use catch-all
// works on both Express 4 and 5 (Express 5 dropped the bare "*" route string).
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

# Fitness Tracker

## Deployment

### Frontend (Railway Static Site)
- Build: `npm run build`
- Serve: The app is served by Express (`server.js`). Deploy via Railway — push to `main` and Railway auto-deploys both frontend and backend. For local preview: `node server.js`
- Environment variable required: `VITE_API_URL`

### Backend (Railway FastAPI service)
- See /backend/README.md (created by T3)
- Environment variable required: `DATABASE_URL`, `SECRET_KEY`

### Local Development
- Frontend: `npm run dev` → http://localhost:5173
- Backend: `cd backend && uvicorn main:app --reload` → http://localhost:8000

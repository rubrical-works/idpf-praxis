# Vibe Agent System Instructions (Web)
**Version:** v0.48.3
**Type:** Web Application Agent Behaviors
**Extends:** Vibe-Agent-Core-Instructions.md
---
## Purpose
Specializes core instructions for web application development (frontend, backend, full-stack).
**Adds:** Web project detection, frontend/backend/full-stack patterns, browser testing, API testing, local server management.
---
## Detection
**Direct indicators:** web app, website, API, frontend, backend, browser, server, localhost.
**Framework indicators:** React/Vue/Svelte → Frontend, Express/Fastify → Backend (Node), Flask/Django → Backend (Python), Next.js/Remix → Full-stack.
---
## Project-Type-Specific Behaviors
**Frontend:**
```
STEP 1: npm install
STEP 2: npm run dev
STEP 3: Note URL (usually http://localhost:5173)
STEP 4: Open browser
STEP 5: Verify: Page loads, UI renders, can interact
STEP 6: Test hot reload (edit, save, auto-update)
STEP 7: Check DevTools Console (F12) for errors
STEP 8: Report results
```
**Backend:**
```
Node.js/Express: node server.js
Python/Flask: python app.py
Server shows: "Running on http://localhost:3000"
Test API: curl http://localhost:3000/api/endpoint
Report: API response and any errors
```
**Full-Stack (Next.js):**
```
STEP 1: npm run dev
STEP 2: Open http://localhost:3000
STEP 3: Verify frontend loads
STEP 4: Test API: http://localhost:3000/api/items
STEP 5: Verify full flow: UI → API calls → Response
STEP 6: Check DevTools Network tab
STEP 7: Report frontend and API behavior
```
---
## API Testing with curl
**GET:** `curl http://localhost:3000/api/endpoint`
**POST:** `curl -X POST http://localhost:3000/api/endpoint -H "Content-Type: application/json" -d '{"key":"value"}'`
---
## CORS Handling
When CORS error appears:
**Express:** `const cors = require('cors'); app.use(cors());`
**Flask:** `from flask_cors import CORS; CORS(app)`
---
## Common Errors
**"Module not found":** `npm install [package-name]` → Restart dev server.
**"EADDRINUSE" (Port in use):** `PORT=3001 npm run dev` OR kill process: `lsof -i :3000` then `kill -9 [PID]`.
---
## Quick Reference
| Framework | Command | Port |
|-----------|---------|------|
| Vite | `npm run dev` | 5173 |
| Next.js | `npm run dev` | 3000 |
| Express | `node server.js` | 3000 |
| Flask | `python app.py` | 5000 |
---
**End of Web Agent Instructions**

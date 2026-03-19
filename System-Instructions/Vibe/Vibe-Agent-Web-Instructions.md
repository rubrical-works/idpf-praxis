# Vibe Agent System Instructions (Web)
**Version:** v0.66.2

**Revision Date:** 2024-11-13
**Type:** Web Application Agent Behaviors
**Extends:** Vibe-Agent-Core-Instructions.md (Rev 1.3)

## **Purpose**

Specializes core instructions for web application development (frontend, backend, full-stack).

**Adds ONLY web-specific behaviors:**
- Web project type detection
- Frontend/backend/full-stack patterns
- Browser testing guidance
- API testing patterns
- Local server management

## **Web Project Detection**

**Direct indicators:**
- User says "web app", "website", "API", "frontend", "backend"
- Mentions "React", "Vue", "Express", "Flask", "Django"
- References "browser", "server", "localhost"

**Language/framework indicators:**
- React/Vue/Svelte → Frontend
- Express/Fastify → Backend (Node.js)
- Flask/Django → Backend (Python)
- Next.js/Remix → Full-stack

## **Project-Type-Specific Behaviors**

### **Frontend**

**Starting dev servers:**
```
STEP 1: Install dependencies:
npm install

STEP 2: Start dev server:
npm run dev

STEP 3: Note URL (usually http://localhost:5173)

STEP 4: Open browser to that URL

STEP 5: Verify:
  - Page loads
  - UI renders
  - Can interact with elements

STEP 6: Test hot reload:
  - Edit file
  - Save
  - Browser updates automatically

STEP 7: Check DevTools Console (F12) for errors

STEP 8: Report results
```

### **Backend**

**Starting servers:**
```
Node.js/Express:
node server.js

Python/Flask:
python app.py

Server shows: "Running on http://localhost:3000"

Test API with curl:
curl http://localhost:3000/api/endpoint

Report: API response and any errors
```

### **Full-Stack (Next.js)**

**Running full-stack:**
```
STEP 1: Start Next.js:
npm run dev

STEP 2: Open http://localhost:3000

STEP 3: Verify frontend loads

STEP 4: Test API directly:
Open http://localhost:3000/api/items

STEP 5: Verify full flow:
  - UI → API calls → Response

STEP 6: Check DevTools Network tab

STEP 7: Report frontend and API behavior
```

## **API Testing with curl**

**GET:**
```
curl http://localhost:3000/api/endpoint
```

**POST:**
```
curl -X POST http://localhost:3000/api/endpoint \
  -H "Content-Type: application/json" \
  -d '{"key":"value"}'
```

## **CORS Handling**

**When CORS error appears:**
```
Browser blocking frontend from accessing backend.

Express fix:
const cors = require('cors');
app.use(cors());

Flask fix:
from flask_cors import CORS
CORS(app)
```

## **Common Web Errors**

**"Module not found":**
```
STEP 1: Install package:
npm install [package-name]

STEP 2: Restart dev server
```

**"EADDRINUSE" (Port in use):**
```
STEP 1: Change port:
PORT=3001 npm run dev

Or kill process on port:
lsof -i :3000  (Mac/Linux)
kill -9 [PID]
```

## **Quick Reference**

### **Dev Servers**

| Framework | Command | Port |
|-----------|---------|------|
| Vite | `npm run dev` | 5173 |
| Next.js | `npm run dev` | 3000 |
| Express | `node server.js` | 3000 |
| Flask | `python app.py` | 5000 |

**End of Web Agent Instructions**

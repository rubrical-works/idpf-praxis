# Vibe-to-Structured Development Framework (Web)
**Version:** v0.76.0
**Type:** Web Application Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md (Rev 2)
## Purpose
Specializes Core Framework for web application development: frontend, backend, and full-stack.
**Evolution Target:** IDPF-Agile
## Web Platform Coverage
- **Frontend**: React, Vue, Svelte, vanilla JavaScript, HTML/CSS
- **Backend**: Node.js, Python (Flask/Django), Ruby (Rails), PHP
- **Full-stack**: Next.js, Remix, SvelteKit, Nuxt, Rails
- **Static Sites**: 11ty, Hugo, Jekyll, Astro
**Application Types:** SPAs, MPAs, static sites, REST APIs, GraphQL APIs, SSR, PWAs
## Platform-Specific Session Initialization
Follow Core Framework initialization (Steps 1-4), then ask:
- **Type of project?** (Frontend only / Backend only / Full-stack)
- **Frontend framework?** (React / Vue / Svelte / Vanilla JS / None)
- **Backend framework?** (Node.js / Python / Ruby / PHP / None)
- **Database needed?** (Yes: PostgreSQL/MySQL/MongoDB / No / Later)
- **API type?** (REST / GraphQL / None)
## Frontend Development
### Development Environment
- Node.js and npm/yarn/pnpm
- Modern browser with DevTools
- **Tools**: Vite (recommended), Webpack, Parcel, esbuild
### Project Setup (Vite)
```bash
# React
npm create vite@latest my-app -- --template react
# Vue
npm create vue@latest my-app
# Svelte
npm create vite@latest my-app -- --template svelte
cd my-app && npm install && npm run dev
```
### Frontend Verification Pattern
```
STEP 6: Start dev server: npm run dev
STEP 7: Open browser to http://localhost:5173
STEP 8: Verify: page loads, content renders, no console errors
STEP 9: Test hot reload: edit source, save, verify browser updates
STEP 10: Open DevTools (F12): check Console, Network, Elements
STEP 11: Report what appears, any errors, hot reload status
```
## Backend Development
### Node.js/Express
```bash
mkdir my-api && cd my-api && npm init -y && npm install express cors
```
```javascript
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());
app.get('/api/todos', (req, res) => {
  res.json([{ id: 1, text: 'Learn Express', done: false }]);
});
app.post('/api/todos', (req, res) => {
  const newTodo = { id: Date.now(), text: req.body.text, done: false };
  res.status(201).json(newTodo);
});
app.listen(3000, () => console.log('Server on http://localhost:3000'));
```
### Backend Verification Pattern
```
STEP 6: Start server: node server.js
STEP 7: Should show "Server running on http://localhost:3000"
STEP 8: Test: curl http://localhost:3000/api/todos
STEP 9: Verify JSON response, status 200
STEP 10: Test POST with curl -X POST ... -H "Content-Type: application/json" -d '{"text":"New"}'
STEP 11: Report API responses, errors, status codes
```
### Python/Flask
```bash
mkdir my-api && cd my-api && python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install flask flask-cors
```
```python
from flask import Flask, jsonify, request
from flask_cors import CORS
app = Flask(__name__)
CORS(app)
todos = [{'id': 1, 'text': 'Learn Flask', 'done': False}]
@app.route('/api/todos', methods=['GET'])
def get_todos():
    return jsonify(todos)
@app.route('/api/todos', methods=['POST'])
def create_todo():
    data = request.get_json()
    new_todo = {'id': len(todos) + 1, 'text': data['text'], 'done': False}
    todos.append(new_todo)
    return jsonify(new_todo), 201
if __name__ == '__main__':
    app.run(debug=True, port=3000)
```
## Full-Stack Development
### Next.js
```bash
npx create-next-app@latest my-app && cd my-app && npm run dev
```
### Full-Stack Verification Pattern
```
STEP 6: Start: npm run dev
STEP 7: Open http://localhost:3000
STEP 8: Verify frontend renders
STEP 9: Test API: http://localhost:3000/api/todos
STEP 10: Test data flow via UI + Network tab
STEP 11: Report frontend behavior, API responses, errors
```
## Database Integration
### SQLite (Node.js with better-sqlite3)
```javascript
const Database = require('better-sqlite3');
const db = new Database('todos.db');
db.exec(`CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, done INTEGER DEFAULT 0)`);
```
### PostgreSQL (Node.js with pg)
```javascript
const { Pool } = require('pg');
const pool = new Pool({ user: 'postgres', host: 'localhost', database: 'myapp', password: 'password', port: 5432 });
```
### MongoDB (Node.js)
```javascript
const { MongoClient } = require('mongodb');
const client = new MongoClient('mongodb://localhost:27017');
```
## API Testing
```bash
curl http://localhost:3000/api/todos                          # GET
curl -X POST http://localhost:3000/api/todos -H "Content-Type: application/json" -d '{"text":"New"}'  # POST
curl -X PUT http://localhost:3000/api/todos/1 -H "Content-Type: application/json" -d '{"done":true}'   # PUT
curl -X DELETE http://localhost:3000/api/todos/1              # DELETE
```
## Web-Specific Requirements Template Additions
At Evolution Point, add: Technology Stack (frontend, backend, deployment), Browser Support (last 2 versions of Chrome/Firefox/Safari/Edge), Performance Targets (FCP < 1.5s, TTI < 3s, Lighthouse > 90).
## Web Development Best Practices
### During Vibe Phase
- **Frontend**: Start dev server immediately, use hot reload, mock APIs initially, focus on UI/UX flow
- **Backend**: Start with in-memory data, add DB later, test with curl, use nodemon for auto-restart
- **Full-Stack**: Run both servers, test full data flow early, handle CORS
### At Evolution Point
- Document API endpoints, define DB schema, plan auth, consider deployment, set performance budgets
### During Structured Phase
- Add comprehensive tests, optimize bundle size, implement error handling, add loading states, consider accessibility
## Common Web Patterns
### React Context State Management
```javascript
const TodoContext = createContext();
export function TodoProvider({ children }) {
  const [todos, setTodos] = useState([]);
  return <TodoContext.Provider value={{ todos, setTodos }}>{children}</TodoContext.Provider>;
}
```
### API Error Handling
```javascript
async function fetchTodos() {
  try {
    const response = await fetch('/api/todos');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch:', error);
    return [];
  }
}
```
## Testing Strategies
### Frontend (React Testing Library)
```javascript
import { render, screen, fireEvent } from '@testing-library/react';
test('adds a new todo', () => {
  render(<App />);
  fireEvent.change(screen.getByPlaceholderText('New todo'), { target: { value: 'Test' } });
  fireEvent.click(screen.getByText('Add'));
  expect(screen.getByText('Test')).toBeInTheDocument();
});
```
### Backend (Jest + Supertest)
```javascript
const request = require('supertest');
describe('GET /api/todos', () => {
  it('returns todos array', async () => {
    const response = await request(app).get('/api/todos');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
```
**End of Web Framework**

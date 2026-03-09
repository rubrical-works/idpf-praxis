# **Vibe-to-Structured Development Framework (Web)**
**Version:** v0.60.0
**Type:** Web Application Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md (Rev 2)

## **Purpose**
This framework specializes the **Vibe-to-Structured Core Framework** for web application development. It provides guidance for frontend, backend, and full-stack web development.
**Read this in combination with:**
- `Vibe-to-Structured-Core-Framework.md` - Core workflow and methodology
**This document adds:**
- Frontend development patterns
- Backend development patterns
- Full-stack development strategies
- Local server management
- Browser-based testing
- API development and testing
- Database setup and operations
- Web-specific deployment considerations
**Evolution Target:** IDPF-Agile (sprints, user stories, iterative delivery)
See Core Framework for details on the evolution process.

## **Web Platform Coverage**
This framework covers:
- **Frontend**: React, Vue, Svelte, vanilla JavaScript, HTML/CSS
- **Backend**: Node.js, Python (Flask/Django), Ruby (Rails), PHP
- **Full-stack**: Next.js, Remix, SvelteKit, Nuxt, Rails
- **Static Sites**: 11ty, Hugo, Jekyll, Astro

### **Application Types**
- **Single Page Applications (SPAs)**: React, Vue, Angular
- **Multi-Page Applications (MPAs)**: Traditional server-rendered apps
- **Static Sites**: Blogs, documentation, marketing sites
- **REST APIs**: Backend services and microservices
- **GraphQL APIs**: Modern API layer
- **Server-Side Rendered (SSR)**: Next.js, Nuxt, SvelteKit
- **Progressive Web Apps (PWAs)**: Offline-capable web apps

## **Platform-Specific Session Initialization**
When starting a web vibe project, the ASSISTANT follows Core Framework initialization (Steps 1-4, including establishing project location), then adds:
**Web-Specific Questions:**
- **Type of project?** (Frontend only / Backend only / Full-stack)
- **Frontend framework?** (React / Vue / Svelte / Vanilla JS / None)
- **Backend framework?** (Node.js / Python / Ruby / PHP / None)
- **Database needed?** (Yes: PostgreSQL/MySQL/MongoDB / No / Later)
- **API type?** (REST / GraphQL / None)
**Starting Point Suggestions:**
For frontend SPA:
```
Let's start with a React app:
- Create React app with Vite
- Set up basic component structure
- Add routing
- Test in browser at localhost:5173
```
For backend API:
```
Let's start with a Node.js Express API:
- Set up Express server
- Create basic route
- Add middleware
- Test with curl or Postman
```
For full-stack:
```
Let's start with Next.js:
- Create Next.js app
- Set up pages and API routes
- Add database connection
- Test entire stack locally
```

## **Frontend Development**

### **Development Environment**
**Requirements:**
- Node.js and npm/yarn/pnpm
- Modern browser (Chrome, Firefox, Safari, Edge)
- Browser DevTools
- Code editor (VS Code, WebStorm, etc.)
**Common Tools:**
- **Vite**: Fast build tool and dev server
- **Webpack**: Classic bundler (for complex setups)
- **Parcel**: Zero-config bundler
- **esbuild**: Extremely fast bundler

### **React/Vue/Svelte Development**
**Project Setup (Vite):**
```bash
# React
npm create vite@latest my-app -- --template react

# Vue
npm create vue@latest my-app

# Svelte
npm create vite@latest my-app -- --template svelte

cd my-app
npm install
npm run dev
```

### **Frontend Verification Pattern**
```
STEP 6: Start development server:
npm run dev

STEP 7: Open browser to:
http://localhost:5173 (or port shown in terminal)

STEP 8: Verify the app:
  - Page loads successfully
  - Main content renders
  - No errors in browser console

STEP 9: Test hot reload:
  - Edit a source file
  - Save changes
  - Verify browser updates automatically

STEP 10: Open DevTools (F12):
  - Console tab: Check for errors
  - Network tab: See resource loading
  - Elements tab: Inspect DOM

STEP 11: Report:
  - What appears in browser
  - Any console errors
  - Hot reload working?
```

## **Backend Development**

### **Node.js/Express**
**Project Setup:**
```bash
mkdir my-api
cd my-api
npm init -y
npm install express cors
```
**Basic Express Server:**
```javascript
// server.js
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/api/todos', (req, res) => {
  res.json([
    { id: 1, text: 'Learn Express', done: false },
    { id: 2, text: 'Build API', done: true }
  ]);
});

app.post('/api/todos', (req, res) => {
  const { text } = req.body;
  const newTodo = {
    id: Date.now(),
    text,
    done: false
  };
  res.status(201).json(newTodo);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```
**Backend Verification Pattern:**
```
STEP 6: Start the server:
node server.js

STEP 7: Server should show:
"Server running on http://localhost:3000"

STEP 8: Test with curl:
curl http://localhost:3000/api/todos

STEP 9: Verify response:
  - Should return JSON array
  - Status code 200

STEP 10: Test POST endpoint:
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"text":"New todo"}'

STEP 11: Report:
  - API responses
  - Any errors in terminal
  - Status codes
```

### **Python/Flask**
**Project Setup:**
```bash
mkdir my-api
cd my-api
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install flask flask-cors
```
**Basic Flask API:**
```python
# app.py
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

todos = [
    {'id': 1, 'text': 'Learn Flask', 'done': False},
    {'id': 2, 'text': 'Build API', 'done': True}
]

@app.route('/api/todos', methods=['GET'])
def get_todos():
    return jsonify(todos)

@app.route('/api/todos', methods=['POST'])
def create_todo():
    data = request.get_json()
    new_todo = {
        'id': len(todos) + 1,
        'text': data['text'],
        'done': False
    }
    todos.append(new_todo)
    return jsonify(new_todo), 201

if __name__ == '__main__':
    app.run(debug=True, port=3000)
```

## **Full-Stack Development**

### **Next.js (React Full-Stack)**
**Project Setup:**
```bash
npx create-next-app@latest my-app
cd my-app
npm run dev
```
**API Route Example:**
```javascript
// pages/api/todos.js
let todos = [
  { id: 1, text: 'Learn Next.js', done: false }
];

export default function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json(todos);
  } else if (req.method === 'POST') {
    const newTodo = {
      id: Date.now(),
      text: req.body.text,
      done: false
    };
    todos.push(newTodo);
    res.status(201).json(newTodo);
  }
}
```
**Full-Stack Verification Pattern:**
```
STEP 6: Start Next.js dev server:
npm run dev

STEP 7: Open browser to:
http://localhost:3000

STEP 8: Verify frontend:
  - Page loads
  - UI renders correctly

STEP 9: Test API routes:
Open http://localhost:3000/api/todos
Should see JSON response

STEP 10: Test from frontend:
  - Interact with UI
  - Check Network tab for API calls
  - Verify data flow

STEP 11: Report:
  - Frontend behavior
  - API responses
  - Any errors
```

## **Database Integration**

### **SQLite (Simple)**
**Node.js with better-sqlite3:**
```javascript
const Database = require('better-sqlite3');
const db = new Database('todos.db');

// Create table
db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    done INTEGER DEFAULT 0
  )
`);

// Insert
const insert = db.prepare('INSERT INTO todos (text) VALUES (?)');
insert.run('Learn SQL');

// Query
const todos = db.prepare('SELECT * FROM todos').all();
console.log(todos);
```

### **PostgreSQL**
**Node.js with pg:**
```javascript
const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'myapp',
  password: 'password',
  port: 5432,
});

// Query
const getTodos = async () => {
  const result = await pool.query('SELECT * FROM todos');
  return result.rows;
};
```

### **MongoDB**
**Node.js with mongodb:**
```javascript
const { MongoClient } = require('mongodb');

const url = 'mongodb://localhost:27017';
const client = new MongoClient(url);

async function getTodos() {
  await client.connect();
  const db = client.db('myapp');
  const todos = await db.collection('todos').find({}).toArray();
  return todos;
}
```

## **API Testing**

### **With curl**
```bash
# GET request
curl http://localhost:3000/api/todos

# POST request
curl -X POST http://localhost:3000/api/todos \
  -H "Content-Type: application/json" \
  -d '{"text":"New todo"}'

# PUT request
curl -X PUT http://localhost:3000/api/todos/1 \
  -H "Content-Type: application/json" \
  -d '{"done":true}'

# DELETE request
curl -X DELETE http://localhost:3000/api/todos/1
```

### **With fetch (JavaScript)**
```javascript
// GET
const todos = await fetch('http://localhost:3000/api/todos')
  .then(res => res.json());

// POST
const newTodo = await fetch('http://localhost:3000/api/todos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text: 'New todo' })
}).then(res => res.json());
```

## **Web-Specific Requirements Template Additions**
When generating requirements at Evolution Point, add:

### **Technology Stack**
```markdown
## Technology Stack

### Frontend
- Framework: React 18
- Build tool: Vite
- Styling: CSS Modules / Tailwind / Styled Components
- State management: React Context / Redux / Zustand
- Routing: React Router

### Backend
- Framework: Express (Node.js)
- API style: REST / GraphQL
- Authentication: JWT / OAuth
- Database: PostgreSQL / MongoDB

### Deployment
- Frontend: Vercel / Netlify / AWS S3
- Backend: Railway / Heroku / AWS EC2
- Database: Hosted service / Self-managed
```

### **Browser Support**
```markdown
## Browser Support

- Chrome (last 2 versions)
- Firefox (last 2 versions)
- Safari (last 2 versions)
- Edge (last 2 versions)
```

### **Performance Targets**
```markdown
## Performance Targets

- First Contentful Paint: < 1.5s
- Time to Interactive: < 3s
- Lighthouse Score: > 90
```

## **Web Development Best Practices**

### **During Vibe Phase**
**Frontend:**
- Start dev server immediately
- Use hot reload for rapid iteration
- Mock API responses initially
- Focus on UI/UX flow
- Test in one browser first
**Backend:**
- Start with simple in-memory data
- Add database later
- Test endpoints with curl
- Log requests to console
- Use nodemon for auto-restart
**Full-Stack:**
- Run both servers simultaneously
- Test full data flow early
- Use proxy for API during development
- Handle CORS properly

### **At Evolution Point**
- Document API endpoints
- Define database schema
- Plan authentication
- Consider deployment strategy
- Set performance budgets

### **During Structured Phase**
- Add comprehensive tests
- Optimize bundle size
- Implement proper error handling
- Add loading states
- Consider accessibility

## **Common Web Patterns**

### **Frontend State Management**
```javascript
// React Context
const TodoContext = createContext();

export function TodoProvider({ children }) {
  const [todos, setTodos] = useState([]);

  return (
    <TodoContext.Provider value={{ todos, setTodos }}>
      {children}
    </TodoContext.Provider>
  );
}
```

### **API Error Handling**
```javascript
async function fetchTodos() {
  try {
    const response = await fetch('/api/todos');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to fetch todos:', error);
    return [];
  }
}
```

### **Form Handling**
```javascript
function TodoForm({ onSubmit }) {
  const [text, setText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim()) {
      onSubmit(text);
      setText('');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="New todo"
      />
      <button type="submit">Add</button>
    </form>
  );
}
```

## **Testing Strategies for Web**

### **Frontend Testing**
```javascript
// React Testing Library
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

test('adds a new todo', () => {
  render(<App />);

  const input = screen.getByPlaceholderText('New todo');
  const button = screen.getByText('Add');

  fireEvent.change(input, { target: { value: 'Test todo' } });
  fireEvent.click(button);

  expect(screen.getByText('Test todo')).toBeInTheDocument();
});
```

### **Backend Testing**
```javascript
// Jest + Supertest
const request = require('supertest');
const app = require('./server');

describe('GET /api/todos', () => {
  it('returns todos array', async () => {
    const response = await request(app).get('/api/todos');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});
```

## **When to Use Web Framework**
**Use this framework when building:**
✅ Web applications (SPAs, MPAs)
✅ REST or GraphQL APIs
✅ Full-stack web apps
✅ Static websites
✅ Progressive Web Apps
✅ Browser-based tools
**Consider other frameworks for:**
❌ Desktop applications → Use Desktop Framework
❌ Mobile apps → Use Mobile Framework
❌ Games → Consider Game Framework
**End of Web Framework**

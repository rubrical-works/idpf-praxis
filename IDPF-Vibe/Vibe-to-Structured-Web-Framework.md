# Vibe-to-Structured Development Framework (Web)
**Version:** v0.51.0
**Type:** Web Application Specialization
**Extends:** Vibe-to-Structured-Core-Framework.md
## Purpose
Specializes Core Framework for web applications: frontend SPAs, full-stack apps, and backend APIs.
**Evolution Target:** IDPF-Agile
## Web Technology Selection
### Frontend
| Framework | Best For | Learning Curve |
|-----------|----------|----------------|
| **React** | Complex UI, large ecosystem | Medium |
| **Vue** | Gentle learning, flexibility | Low |
| **Svelte** | Performance, simplicity | Low |
| **Next.js** | React + SSR/SSG | Medium |
| **Nuxt** | Vue + SSR/SSG | Medium |
### Backend
| Framework | Language | Best For |
|-----------|----------|----------|
| **Express** | Node.js | APIs, microservices |
| **Fastify** | Node.js | Performance APIs |
| **Django** | Python | Full-featured apps |
| **FastAPI** | Python | Modern APIs |
| **Rails** | Ruby | Full-stack, rapid dev |
| **Go** | Go | High-performance APIs |
## Session Initialization
After Core Framework Steps 1-4:
**Web-Specific Questions:**
- Frontend or backend focus? (Frontend / Backend / Full-stack)
- Framework preference? (React / Vue / Svelte / None)
- Rendering strategy? (CSR / SSR / SSG / Hybrid)
- API type? (REST / GraphQL / tRPC)
- Database? (PostgreSQL / MongoDB / SQLite / None yet)
## Frontend Development
### React Project Structure
```
src/
├── components/       # Reusable components
├── pages/           # Route components
├── hooks/           # Custom hooks
├── services/        # API calls
├── store/           # State management
├── utils/           # Helpers
└── App.tsx
```
### State Management
| Solution | Best For |
|----------|----------|
| useState/useReducer | Component-local |
| Context | Shared state, simple |
| Redux Toolkit | Complex, predictable |
| Zustand | Simple global |
| TanStack Query | Server state |
### Component Pattern
```typescript
interface Props {
  title: string;
  onSubmit: (data: FormData) => void;
}
export function MyComponent({ title, onSubmit }: Props) {
  const [data, setData] = useState<FormData>(initialData);
  return (
    <div>
      <h1>{title}</h1>
      <form onSubmit={() => onSubmit(data)}>{/* form fields */}</form>
    </div>
  );
}
```
## Backend Development
### Express Pattern
```typescript
import express from 'express';
const app = express();
app.use(express.json());
app.get('/api/items', async (req, res) => {
  const items = await db.items.findMany();
  res.json(items);
});
app.post('/api/items', async (req, res) => {
  const item = await db.items.create({ data: req.body });
  res.status(201).json(item);
});
```
### FastAPI Pattern
```python
from fastapi import FastAPI
from pydantic import BaseModel
app = FastAPI()
class Item(BaseModel):
    name: str
    price: float
@app.get("/items")
async def get_items():
    return await db.items.find_many()
@app.post("/items", status_code=201)
async def create_item(item: Item):
    return await db.items.create(item.dict())
```
### Database Patterns
| ORM | Language | Database |
|-----|----------|----------|
| **Prisma** | TypeScript | PostgreSQL, MySQL, SQLite |
| **Drizzle** | TypeScript | PostgreSQL, MySQL, SQLite |
| **SQLAlchemy** | Python | Any SQL |
| **Mongoose** | TypeScript | MongoDB |
## Full-Stack Development
### Next.js API Routes
```typescript
// pages/api/items/[id].ts
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  switch (req.method) {
    case 'GET':
      const item = await db.item.findUnique({ where: { id: String(id) } });
      return res.json(item);
    case 'PUT':
      const updated = await db.item.update({ where: { id: String(id) }, data: req.body });
      return res.json(updated);
    default:
      return res.status(405).end();
  }
}
```
## Verification Pattern
```
STEP 6: Start dev server: npm run dev
STEP 7: Open browser to localhost:3000 (or specified port)
STEP 8: Test UI interactions, API responses
STEP 9: Check browser DevTools console
STEP 10: Test responsive design
STEP 11: Report results
```
## Web-Specific Requirements
### At Evolution Point Add:
```markdown
## Browser Support
Targets: Chrome, Firefox, Safari, Edge (latest 2 versions)
Mobile: iOS Safari, Chrome Mobile
## Performance Targets
LCP: < 2.5s
FID: < 100ms
CLS: < 0.1
Bundle size: < 200KB (gzipped)
## API Specification
Format: OpenAPI 3.0
Authentication: JWT / OAuth2
Rate limiting: [limits]
```
## Web-Specific Transition Triggers
| Trigger | Action |
|---------|--------|
| > 10 components | Component architecture needed |
| Auth required | Security review |
| > 5 API endpoints | API documentation |
| Public deployment | Performance audit |
| Multiple data sources | State management design |
## Best Practices
### Vibe Phase
- Start with minimal setup (Vite)
- Use dev server hot reload
- Mock API initially
- Focus on core features
### Structured Phase
- Add TypeScript types
- Implement error boundaries
- API documentation
- Performance optimization
- Accessibility audit
- Security headers
---
**End of Web Framework**

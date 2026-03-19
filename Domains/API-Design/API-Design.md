# API Design Domain
**Version:** v0.66.2
**Type:** Domain
**Companion Skill:** api-versioning
## Overview
Evaluative criteria for REST, GraphQL, and RPC API design across project artifacts. Surfaces resource naming, error contracts, versioning, pagination, and documentation concerns during reviews.
**Core Principle:** APIs are contracts. Resource naming, error formats, versioning strategies, and pagination patterns should be decided during design and enforced through reviews.
## Domain Scope
| Concern | Description |
|---------|-------------|
| Resource Naming | RESTful naming, pluralization, nested resources, URL structure |
| HTTP Semantics | Correct method usage, idempotency, status codes |
| Error Contracts | Structured error responses, error codes, field-level validation |
| Pagination | Cursor-based vs offset-based, page size limits, total count |
| Authentication | API key, OAuth 2.0, JWT, scope-based authorization |
| Versioning | URL path vs header vs query parameter, deprecation strategy |
| Documentation | OpenAPI/Swagger specs, examples, schema validation |
## When This Domain Applies
- Designing new REST or GraphQL APIs
- Adding endpoints to existing APIs
- Defining error response contracts
- Implementing pagination, filtering, or sorting
- Establishing versioning or deprecation strategies
## Tool Ecosystem
| Tool | Purpose |
|------|---------|
| OpenAPI / Swagger | API specification and documentation |
| Spectral | API style guide linting |
| Redocly | API documentation generation |
| Postman | API testing and exploration |
| Stoplight | API design-first workflow |
**End of API Design Domain**

# API Design Review Criteria
**Domain:** Resource naming, HTTP semantics, error contracts, versioning, pagination, documentation
**Companion Skill:** api-versioning
## Charter Review Questions
- Does the project expose APIs (REST, GraphQL, RPC) to external or internal consumers?
- Is an API versioning strategy defined (URL path, header, query parameter)?
- Are error response formats standardized across the API surface?
- Does the tech stack include API documentation tooling (OpenAPI, Swagger)?
## Proposal Review Questions
- Does the proposal define the API contract (endpoints, methods, request/response shapes)?
- Is the versioning strategy consistent with existing APIs in the project?
- Are error handling patterns specified for the new API surface?
- Does the proposal address backward compatibility for existing consumers?
- Are authentication and authorization requirements defined for new endpoints?
## PRD Review Questions
- Do user stories include API contract acceptance criteria (status codes, response shapes)?
- Are pagination requirements defined for list endpoints?
- Does the PRD specify error response structure and error codes?
- Are rate limiting and throttling requirements addressed?
- Does the test plan include API contract validation (schema tests, status code verification)?
- Is API documentation generation included as a deliverable?
## Issue Review Questions
- Does this endpoint follow the project's resource naming conventions?
- Are HTTP methods used correctly (GET for reads, POST for creation, PUT/PATCH for updates)?
- Does the response include appropriate HTTP status codes (201 for creation, 204 for no content)?
- Is the error response structure consistent with the project's error contract?
- Does the endpoint implement pagination for list responses?
- Are query parameters documented and validated?
- Is authentication/authorization enforced appropriately?
- Does the endpoint support the project's versioning strategy?
## Code Review Questions
- Does the endpoint return correct HTTP status codes for success and error cases?
- Are request bodies validated with schema validation (not just null checks)?
- Does the error response follow the project's standard error format with error codes?
- Are list endpoints paginated with consistent cursor/offset patterns?
- Is input sanitized and validated at the API boundary?
- Does the code enforce authentication and scope-based authorization?
- Are response shapes consistent with the OpenAPI/Swagger spec (if one exists)?
- Does the endpoint handle edge cases (empty results, not found, conflict)?

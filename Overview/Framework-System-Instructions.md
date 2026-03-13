# Framework System Instructions Reference
**Version:** v0.63.0
**Purpose:** Detailed reference for System Instructions

## System Instructions Overview
**Location:** `System-Instructions/`
**Purpose:** Define assistant identity, expertise, and behavioral patterns
**Critical Requirement:** System Instructions are **REQUIRED** for all framework operation. Frameworks define process; System Instructions define identity and expertise.

## Domain Specialization Architecture
**Architecture Pattern:** Core + Domain Specialization
- **Core-Developer-Instructions.md (Rev 1.0)**: Foundation competencies for all developers
- **22 Domain Specialists**: Specialized expertise profiles (loaded with Core)
- **Domain-Selection-Guide.md (Rev 1.0)**: Guide for choosing appropriate specialist(s)

### Loading Pattern
1. Load Core-Developer-Instructions.md (universal competencies)
2. Load appropriate Domain specialist file(s) for depth
3. Domain extends and deepens core competencies

### Core Developer Competencies
- Version Control (Git workflows, branching strategies, PR reviews)
- Testing Fundamentals (Unit, Integration, E2E, TDD methodology)
- Agile Development (Scrum, Kanban, backlog management, CI/CD)
- Code Quality (SOLID, DRY, YAGNI, KISS principles)
- Design Patterns (Creational, Structural, Behavioral, MVC, Repository)
- Cross-Platform Awareness (OS differences, path handling)
- Security Fundamentals (OWASP Top 10, input validation, authentication)
- Performance Basics (Big O notation, caching strategies, profiling)

## Domain Specialist System Instructions

### 1. Full-Stack-Developer.md
- End-to-end application development spanning frontend and backend
- Holistic system thinking and architectural decisions
- API contract design that serves both layers efficiently
- Technologies: React/Vue/Angular + Node.js/Python/Ruby + PostgreSQL/MongoDB

### 2. Backend-Specialist.md
- Server-side applications, REST/GraphQL APIs
- Authentication/authorization (OAuth, JWT, session management)
- Business logic, middleware, background jobs
- Technologies: Python (Django/Flask/FastAPI), Node.js (Express/NestJS), Ruby (Rails), Java (Spring), Go

### 3. Frontend-Specialist.md
- React, Vue, Angular, Svelte frameworks
- CSS architecture (BEM, CSS Modules, Tailwind, styled-components)
- State management (Redux, Zustand, Pinia, Context API)
- Performance (Core Web Vitals, lazy loading, code splitting)
- Accessibility (WCAG, ARIA, semantic HTML)

### 4. DevOps-Engineer.md
- CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins, CircleCI)
- Containerization (Docker, Docker Compose, container registries)
- Orchestration (Kubernetes, Helm charts, service mesh)
- Infrastructure as Code (Terraform, Pulumi, CloudFormation, Ansible)
- Monitoring (Prometheus, Grafana, ELK stack, Datadog)

### 5. Database-Engineer.md
- Schema design, normalization, indexing strategies
- Query optimization, execution plans, EXPLAIN analysis
- Replication (master-slave, master-master, sharding)
- Migrations (Alembic, Flyway, Liquibase, Rails migrations)
- Technologies: PostgreSQL, MySQL, MongoDB, Redis, Cassandra

### 6. API-Integration-Specialist.md
- REST, GraphQL, gRPC, WebSocket APIs
- Microservices architecture, service discovery
- API gateways (Kong, Tyk, AWS API Gateway)
- Message brokers (Kafka, RabbitMQ, Redis Pub/Sub)
- Service mesh (Istio, Linkerd)

### 7. Security-Engineer.md
- OWASP Top 10 vulnerabilities
- Authentication (OAuth 2.0, OpenID Connect, SAML, multi-factor)
- Cryptography (hashing, encryption, key management)
- Penetration testing, security audits
- Compliance (SOC 2, GDPR, HIPAA)

### 8. Platform-Engineer.md
- Internal developer platforms (IDPs)
- Service catalogs, golden paths
- CI/CD templates and reusable workflows
- Developer experience (DevEx) optimization
- Self-service infrastructure provisioning

### 9. Mobile-Specialist.md
- iOS development (Swift, SwiftUI, UIKit)
- Android development (Kotlin, Jetpack Compose)
- Cross-platform (React Native, Flutter, Ionic)
- Offline-first architecture, local storage
- Push notifications, deep linking, app store deployment

### 10. Data-Engineer.md
- ETL/ELT pipelines (Airflow, Prefect, Dagster)
- Data processing (Spark, Dask, Pandas)
- Data modeling (Kimball, Data Vault, star schema)
- Data warehousing (Snowflake, BigQuery, Redshift)
- Data quality, lineage, governance

### 11. QA-Test-Engineer.md
- Test strategy, test pyramid, risk-based testing
- Test automation (Cypress, Playwright, Selenium, Appium)
- Performance testing (k6, JMeter, Gatling, Locust)
- TDD/BDD methodologies (RSpec, Cucumber, Jest, pytest)
- CI integration, test reporting, coverage analysis

### 12. Cloud-Solutions-Architect.md
- System design, architectural patterns (microservices, event-driven, CQRS)
- AWS/Azure/GCP services and best practices
- Scalability, high availability, disaster recovery
- CAP theorem, eventual consistency, distributed systems
- Architecture Decision Records (ADRs)

### 13. SRE-Specialist.md
- SLO/SLI/SLA definition and management
- Error budgets, reliability engineering
- Observability (logs, metrics, traces, distributed tracing)
- Incident response, postmortems, blameless culture
- Chaos engineering, resilience testing

### 14. Embedded-Systems-Engineer.md
- C/C++ for embedded systems
- ARM Cortex-M, AVR, ESP32 microcontrollers
- RTOS (FreeRTOS, Zephyr, ThreadX)
- Hardware protocols (I2C, SPI, UART, CAN)
- Low-level debugging, memory management

### 15. ML-Engineer.md
- TensorFlow, PyTorch, scikit-learn, XGBoost
- Model development (supervised, unsupervised, reinforcement learning)
- Deep learning architectures (CNN, RNN, LSTM, Transformers, GANs)
- MLOps (MLflow, Kubeflow, SageMaker, model serving)
- Model optimization (quantization, pruning, distillation)

### 16. Performance-Engineer.md
- Application performance optimization
- Profiling (CPU, memory, database profiling)
- Load testing (k6, Gatling, JMeter, Locust)
- Frontend performance (Core Web Vitals, lighthouse)
- Backend performance (query optimization, caching, CDN)
- APM tools (New Relic, Datadog, AppDynamics)

### 17. Accessibility-Specialist.md
- WCAG 2.1/2.2 guidelines and compliance
- Assistive technology testing (screen readers, keyboard navigation)
- Accessibility auditing and remediation
- Legal compliance (ADA, Section 508, EAA)

### 18. Desktop-Application-Developer.md
- Cross-platform desktop applications (Windows, macOS, Linux)
- UI frameworks (Qt, GTK, WinForms, WPF, Electron, Tauri)
- System integration and native APIs
- Packaging, distribution, and installers

### 19. Game-Developer.md
- Game engines (Unity, Unreal, Godot)
- Game programming patterns (game loop, ECS, state machines)
- Physics, collision detection, and rendering
- Multiplayer networking and game services

### 20. Graphics-Engineer-Specialist.md
- Computer graphics fundamentals (rasterization, ray tracing)
- GPU programming (shaders, compute, GPGPU)
- Graphics APIs (Vulkan, DirectX, OpenGL, Metal, WebGPU)
- Rendering pipelines and optimization

### 21. Systems-Programmer-Specialist.md
- Low-level systems programming (memory, concurrency, I/O)
- Operating system internals and kernel development
- Compilers, interpreters, and language runtimes
- Performance-critical code and hardware interaction

### 22. Technical-Writer-Specialist.md
- Documentation engineering and docs-as-code workflows
- API documentation (OpenAPI, AsyncAPI)
- Documentation generators (Docusaurus, MkDocs, Sphinx)
- Technical writing best practices and style guides

## Domain Selection Guide

### Quick Reference
| Use Case | Recommended Domains |
|----------|---------------------|
| Full-Stack Web | Core + Backend + Frontend + Database |
| Cloud-Native Microservices | Core + API-Integration + DevOps + Cloud-Architect |
| Mobile App with Backend | Core + Mobile + Backend |
| Data Platform | Core + Data-Engineer + Database-Engineer + Cloud-Architect |
| Secure Production System | Core + Backend + Security + SRE |

### Decision Tree
- If building APIs/services → Backend-Specialist
- If building UIs → Frontend-Specialist
- If managing infrastructure → DevOps-Engineer or Platform-Engineer
- If designing systems → Cloud-Solutions-Architect
- If ensuring reliability → SRE-Specialist
- If working with data → Data-Engineer + Database-Engineer
- If mobile apps → Mobile-Specialist
- If security focus → Security-Engineer
- If performance focus → Performance-Engineer
- If machine learning → ML-Engineer
- If embedded/IoT → Embedded-Systems-Engineer
- If API integration → API-Integration-Specialist
- If testing → QA-Test-Engineer
- If accessibility → Accessibility-Specialist
- If desktop apps → Desktop-Application-Developer
- If game development → Game-Developer
- If graphics/rendering → Graphics-Engineer-Specialist
- If systems/low-level → Systems-Programmer-Specialist
- If documentation → Technical-Writer-Specialist
**Multiple domains can be combined for cross-functional expertise.**

## Vibe Agent System Instructions

### Vibe-Agent-Core-Instructions.md (Rev 1.3)
- Platform-agnostic behavioral instructions for Vibe-to-Structured workflow
- Defines HOW to behave during exploratory development
- Key behaviors: Concise communication, single code block enforcement, context preservation, TDD cycle management

### Platform-Specific Vibe Instructions
- Vibe-Agent-Desktop-Instructions.md
- Vibe-Agent-Web-Instructions.md
- Vibe-Agent-Mobile-Instructions.md
- Vibe-Agent-Game-Instructions.md
- Vibe-Agent-Embedded-Instructions.md
- Vibe-Agent-Newbie-Instructions.md

### Integration Pattern
- Core Vibe instructions apply to all platforms
- Platform-specific instructions add specialized guidance
- Both must be loaded together for proper behavior
**End of Framework System Instructions Reference**

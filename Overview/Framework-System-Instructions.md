# Framework System Instructions Reference
**Version:** v0.97.0
**Location:** `System-Instructions/`
**Purpose:** Define assistant identity, expertise, and behavioral patterns
**Critical Requirement:** System Instructions are **REQUIRED** for all framework operation. Frameworks define process; System Instructions define identity and expertise.
## Domain Specialization Architecture
**Architecture Pattern:** Domain Specialist loaded at session startup
- **17 Domain Specialists**: Specialized expertise profiles loaded based on `domainSpecialist` in `framework-config.json` (8 Base + 9 Pack)
- **Domain-Selection-Guide.md**: Guide for choosing appropriate specialist (reference only, not distributed)
**Loading Pattern:**
1. Session startup reads `domainSpecialist` from `framework-config.json`
2. Resolves specialist file in `System-Instructions/Domain/Base/` or `Domain/Pack/`
3. Reads specialist file into context (non-blocking if not found)
## Domain Specialist System Instructions
### Base (8) -- one selected at install
**1. Mobile-Specialist.md**
- iOS (Swift, SwiftUI, UIKit); Android (Kotlin, Jetpack Compose)
- Cross-platform (React Native, Flutter, Ionic)
- Offline-first architecture, local storage
- Push notifications, deep linking, app store deployment
**2. Desktop-Application-Developer.md**
- Cross-platform desktop (Windows, macOS, Linux)
- UI frameworks (Qt, GTK, WinForms, WPF, Electron, Tauri)
- System integration and native APIs
- Packaging, distribution, installers
**3. Embedded-Systems-Engineer.md**
- C/C++ for embedded systems
- ARM Cortex-M, AVR, ESP32 microcontrollers
- RTOS (FreeRTOS, Zephyr, ThreadX)
- Hardware protocols (I2C, SPI, UART, CAN)
- Low-level debugging, memory management
**4. Game-Developer.md**
- Game engines (Unity, Unreal, Godot)
- Game programming patterns (game loop, ECS, state machines)
- Physics, collision detection, rendering
- Multiplayer networking and game services
**5. ML-Engineer.md**
- TensorFlow, PyTorch, scikit-learn, XGBoost
- Model development (supervised, unsupervised, reinforcement)
- Deep learning (CNN, RNN, LSTM, Transformers, GANs)
- MLOps (MLflow, Kubeflow, SageMaker, model serving)
- Model optimization (quantization, pruning, distillation)
**6. Data-Engineer.md**
- ETL/ELT pipelines (Airflow, Prefect, Dagster)
- Data processing (Spark, Dask, Pandas)
- Data modeling (Kimball, Data Vault, star schema)
- Data warehousing (Snowflake, BigQuery, Redshift)
- Data quality, lineage, governance
**7. SRE-Specialist.md**
- SLO/SLI/SLA definition and management
- Error budgets, reliability engineering
- Observability (logs, metrics, traces, distributed tracing)
- Incident response, postmortems, blameless culture
- Chaos engineering, resilience testing
**8. Systems-Programmer-Specialist.md**
- Low-level systems programming (memory, concurrency, I/O)
- OS internals and kernel development
- Compilers, interpreters, language runtimes
- Performance-critical code and hardware interaction
### Pack (9) -- JIT loading
**9. Database-Engineer.md**
- Schema design, normalization, indexing strategies
- Query optimization, execution plans, EXPLAIN analysis
- Replication (master-slave, master-master, sharding)
- Migrations (Alembic, Flyway, Liquibase, Rails)
- PostgreSQL, MySQL, MongoDB, Redis, Cassandra
**10. Security-Engineer.md**
- OWASP Top 10 vulnerabilities
- Authentication (OAuth 2.0, OpenID Connect, SAML, MFA)
- Cryptography (hashing, encryption, key management)
- Penetration testing, security audits
- Compliance (SOC 2, GDPR, HIPAA)
**11. QA-Test-Engineer.md**
- Test strategy, test pyramid, risk-based testing
- Test automation (Cypress, Playwright, Selenium, Appium)
- Performance testing (k6, JMeter, Gatling, Locust)
- TDD/BDD (RSpec, Cucumber, Jest, pytest)
- CI integration, test reporting, coverage analysis
**12. Performance-Engineer.md**
- Application performance optimization
- Profiling (CPU, memory, database)
- Load testing (k6, Gatling, JMeter, Locust)
- Frontend performance (Core Web Vitals, lighthouse)
- Backend performance (query optimization, caching, CDN)
- APM tools (New Relic, Datadog, AppDynamics)
**13. Accessibility-Specialist.md**
- WCAG 2.1/2.2 guidelines and compliance
- Assistive technology testing (screen readers, keyboard navigation)
- Accessibility auditing and remediation
- Legal compliance (ADA, Section 508, EAA)
**14. Graphics-Engineer-Specialist.md**
- Graphics fundamentals (rasterization, ray tracing)
- GPU programming (shaders, compute, GPGPU)
- Graphics APIs (Vulkan, DirectX, OpenGL, Metal, WebGPU)
- Rendering pipelines and optimization
**15. Technical-Writer-Specialist.md**
- Documentation engineering, docs-as-code workflows
- API documentation (OpenAPI, AsyncAPI)
- Generators (Docusaurus, MkDocs, Sphinx)
- Technical writing best practices and style guides
**16. UX-Designer.md**
- Layout systems (column, modular, hierarchical, baseline grids)
- Spacing scales, whitespace as a design element
- Visual hierarchy and CTA weighting
- Interaction design and usability
**17. Brand-Strategist.md**
- Brand architecture and portfolio rationalization
- Positioning (audience, category, differentiation, reason to believe)
- Brand pillars and supporting proof points
- Brand values, purpose, voice
## Domain Selection Guide
| Use Case | Recommended Domains |
|----------|---------------------|
| Mobile App | Core + Mobile + Database |
| Data Platform | Core + Data-Engineer + Database-Engineer |
| Secure Production System | Core + Security + SRE |
| Game / Graphics | Core + Game-Developer + Graphics-Engineer-Specialist |
| General web, API, or full-stack | `Full-Stack-Developer` (announce-only), plus Packs on demand |
**Decision Tree:**
- Reliability → SRE-Specialist
- Data → Data-Engineer + Database-Engineer
- Mobile apps → Mobile-Specialist
- Security → Security-Engineer
- Performance → Performance-Engineer
- Machine learning → ML-Engineer
- Embedded/IoT → Embedded-Systems-Engineer
- Testing → QA-Test-Engineer
- Accessibility → Accessibility-Specialist
- Desktop apps → Desktop-Application-Developer
- Game development → Game-Developer
- Graphics/rendering → Graphics-Engineer-Specialist
- Systems/low-level → Systems-Programmer-Specialist
- Documentation → Technical-Writer-Specialist
- Interaction/visual design → UX-Designer
- Brand positioning → Brand-Strategist
- General web, API, or full-stack → `Full-Stack-Developer` (announce-only: active role recorded, nothing injected, auto-includes contract/seo/api-design/qa/privacy/security/accessibility/i18n review domains)
**Multiple domains can be combined for cross-functional expertise.**
**End of Framework System Instructions Reference**

# Framework System Instructions Reference
**Version:** v0.49.1
**Purpose:** Reference for System Instructions
**Critical:** System Instructions REQUIRED for all framework operation.
## Domain Specialization Architecture
**Pattern:** Core + Domain Specialization
- **Core-Developer-Instructions.md (Rev 1.0):** Foundation competencies
- **22 Domain Specialists:** Specialized expertise (loaded with Core)
- **Domain-Selection-Guide.md (Rev 1.0):** Guide for choosing specialist(s)
### Loading Pattern
1. Load Core-Developer-Instructions.md
2. Load appropriate Domain specialist file(s)
3. Domain extends core competencies
### Core Developer Competencies
- Version Control (Git, branching, PR reviews)
- Testing Fundamentals (Unit, Integration, E2E, TDD)
- Agile Development (Scrum, Kanban, CI/CD)
- Code Quality (SOLID, DRY, YAGNI, KISS)
- Design Patterns (Creational, Structural, Behavioral)
- Cross-Platform Awareness
- Security Fundamentals (OWASP Top 10)
- Performance Basics (Big O, caching, profiling)
## Domain Specialists (22)
| # | Specialist | Focus |
|---|------------|-------|
| 1 | Full-Stack-Developer | End-to-end app development |
| 2 | Backend-Specialist | Server-side, REST/GraphQL APIs |
| 3 | Frontend-Specialist | React, Vue, Angular, Svelte |
| 4 | DevOps-Engineer | CI/CD, containers, K8s, IaC |
| 5 | Database-Engineer | Schema design, optimization, replication |
| 6 | API-Integration-Specialist | REST, GraphQL, gRPC, microservices |
| 7 | Security-Engineer | OWASP, auth, crypto, compliance |
| 8 | Platform-Engineer | IDPs, golden paths, DevEx |
| 9 | Mobile-Specialist | iOS, Android, cross-platform |
| 10 | Data-Engineer | ETL, data processing, warehousing |
| 11 | QA-Test-Engineer | Test strategy, automation, TDD/BDD |
| 12 | Cloud-Solutions-Architect | System design, AWS/Azure/GCP |
| 13 | SRE-Specialist | SLO/SLI, observability, incident response |
| 14 | Embedded-Systems-Engineer | C/C++, microcontrollers, RTOS |
| 15 | ML-Engineer | TensorFlow, PyTorch, MLOps |
| 16 | Performance-Engineer | Profiling, load testing, APM |
| 17 | Accessibility-Specialist | WCAG, assistive technology, compliance |
| 18 | Desktop-Application-Developer | Qt, Electron, Tauri, native APIs |
| 19 | Game-Developer | Unity, Unreal, Godot |
| 20 | Graphics-Engineer-Specialist | Vulkan, DirectX, shaders |
| 21 | Systems-Programmer-Specialist | Low-level, OS internals, compilers |
| 22 | Technical-Writer-Specialist | Docs-as-code, API docs |
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
- APIs/services → Backend-Specialist
- UIs → Frontend-Specialist
- Infrastructure → DevOps-Engineer or Platform-Engineer
- System design → Cloud-Solutions-Architect
- Reliability → SRE-Specialist
- Data → Data-Engineer + Database-Engineer
- Mobile → Mobile-Specialist
- Security → Security-Engineer
- Performance → Performance-Engineer
- ML → ML-Engineer
- Embedded/IoT → Embedded-Systems-Engineer
- Testing → QA-Test-Engineer
- Accessibility → Accessibility-Specialist
- Desktop → Desktop-Application-Developer
- Games → Game-Developer
- Graphics → Graphics-Engineer-Specialist
- Systems/low-level → Systems-Programmer-Specialist
- Documentation → Technical-Writer-Specialist
**Multiple domains can be combined.**
## Vibe Agent System Instructions
### Vibe-Agent-Core-Instructions.md (Rev 1.3)
Platform-agnostic behavioral instructions for Vibe-to-Structured workflow. Key behaviors: Concise communication, single code block enforcement, context preservation, TDD cycle management.
### Platform-Specific
- Vibe-Agent-Desktop-Instructions.md
- Vibe-Agent-Web-Instructions.md
- Vibe-Agent-Mobile-Instructions.md
- Vibe-Agent-Game-Instructions.md
- Vibe-Agent-Embedded-Instructions.md
- Vibe-Agent-Newbie-Instructions.md
**Integration:** Core + Platform-specific must be loaded together.
---
**End of Framework System Instructions Reference**

# Domain Specialist Selection Guide
**Version:** v0.48.3
**Purpose:** Guide for selecting appropriate domain specialist for your project during installation.
## How to Use This Guide
**At Installation Time:**
1. Identify project's primary focus
2. Select ONE Base Expert from 12 options
3. Installer configures project with Core + selected specialist
**During Sessions:**
- Selected specialist loads automatically at startup
- Additional expertise (Packs) available on-demand via JIT loading
## Base Experts (Select ONE at Install)
### Backend Specialist
**File:** `Domain/Base/Backend-Specialist.md`
**Use When:** Building server-side applications, REST/GraphQL/gRPC APIs, business logic, authentication/authorization
**Key Expertise:** Server frameworks (Django, Flask, Express, Spring Boot), API design, JWT/OAuth 2.0, middleware, background jobs
### Frontend Specialist
**File:** `Domain/Base/Frontend-Specialist.md`
**Use When:** Building user interfaces, JavaScript frameworks, web applications, client-side logic and UX
**Key Expertise:** React, Vue, Angular, Svelte, CSS architecture, Core Web Vitals, WCAG accessibility, state management
### Full-Stack Developer
**File:** `Domain/Base/Full-Stack-Developer.md`
**Use When:** End-to-end web applications, cross frontend/backend work, rapid prototyping, MVP development
**Key Expertise:** Frontend + Backend integration, API contracts, full application lifecycle
### Mobile Specialist
**File:** `Domain/Base/Mobile-Specialist.md`
**Use When:** Native iOS or Android apps, cross-platform mobile, push notifications, offline-first
**Key Expertise:** iOS (Swift, SwiftUI), Android (Kotlin, Compose), React Native, Flutter, MVVM, MVI
### Desktop Application Developer
**File:** `Domain/Base/Desktop-Application-Developer.md`
**Use When:** Native desktop applications, cross-platform desktop, system tray utilities, rich client apps
**Key Expertise:** Qt, GTK, WinForms, WPF, Electron, Tauri, platform APIs, packaging/distribution
### Game Developer
**File:** `Domain/Base/Game-Developer.md`
**Use When:** Video games, game engines, interactive simulations, game systems and mechanics
**Key Expertise:** Unity, Unreal, Godot, game programming patterns (ECS, state machines), physics, multiplayer
### Embedded Systems Engineer
**File:** `Domain/Base/Embedded-Systems-Engineer.md`
**Use When:** Firmware development, hardware interfacing, real-time systems, IoT devices
**Key Expertise:** C/C++ for embedded, ARM Cortex-M, AVR, ESP32, RTOS, hardware protocols (UART, SPI, I2C)
### Systems Programmer Specialist
**File:** `Domain/Base/Systems-Programmer-Specialist.md`
**Use When:** Low-level systems programming, OS development, compilers, performance-critical systems
**Key Expertise:** Memory management, concurrency primitives, OS internals, compiler design, assembly
### Data Engineer
**File:** `Domain/Base/Data-Engineer.md`
**Use When:** Data pipelines (ETL/ELT), data warehousing, analytics infrastructure, big data
**Key Expertise:** Apache Spark, Airflow, dbt, Snowflake, BigQuery, Kafka, dimensional modeling
### ML Engineer
**File:** `Domain/Base/ML-Engineer.md`
**Use When:** Machine learning models, MLOps, data science, AI/ML features
**Key Expertise:** TensorFlow, PyTorch, scikit-learn, ML lifecycle, deep learning, MLOps
### Cloud Solutions Architect
**File:** `Domain/Base/Cloud-Solutions-Architect.md`
**Use When:** System architecture design, architectural decisions, multi-cloud, scalability design
**Key Expertise:** AWS/Azure/GCP, microservices, serverless, event-driven, CAP theorem, ADRs
### Site Reliability Engineer (SRE)
**File:** `Domain/Base/SRE-Specialist.md`
**Use When:** System reliability, SLOs/error budgets, incident response, observability
**Key Expertise:** SLO/SLI/SLA management, error budgets, observability, incident management, chaos engineering
## Selection Decision Tree
| Focus Area | Select This |
|------------|-------------|
| Building User Interfaces | Frontend Specialist |
| Building APIs or Server Logic | Backend Specialist |
| End-to-End Web Apps | Full-Stack Developer |
| Mobile Application | Mobile Specialist |
| Desktop Application | Desktop Application Developer |
| Video Games | Game Developer |
| Hardware/Firmware/IoT | Embedded Systems Engineer |
| Low-Level/OS/Compilers | Systems Programmer Specialist |
| Data Pipelines/Warehousing | Data Engineer |
| Machine Learning/AI | ML Engineer |
| System Architecture Design | Cloud Solutions Architect |
| Reliability/SLOs/Operations | SRE Specialist |
## Expertise Packs (JIT Loading)
Specialized skill sets loaded on-demand during session:
- **Database-Engineer** - Database design, query optimization
- **DevOps-Engineer** - CI/CD, containerization, infrastructure
- **Security-Engineer** - Application security, OWASP
- **Performance-Engineer** - Optimization, load testing
- **QA-Test-Engineer** - Test strategy, automation
- **Accessibility-Specialist** - WCAG, assistive technology
- **API-Integration-Specialist** - Microservices, API gateways
- **Graphics-Engineer-Specialist** - Rendering, shaders, GPU
- **Platform-Engineer** - Internal developer platforms
- **Technical-Writer-Specialist** - Documentation, API docs
**JIT Loading:** Tell Claude "I need database optimization help" → Claude loads relevant Pack expertise on-demand.
---
**End of Domain Selection Guide**

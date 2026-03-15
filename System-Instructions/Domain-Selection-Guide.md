# Domain Specialist Selection Guide
**Version:** v0.63.1
**Purpose:** Guide for selecting the appropriate domain specialist for your project during installation.

## How to Use This Guide
**At Installation Time:**
1. Identify your project's primary focus
2. Select ONE Base Expert from the 12 options below
3. The installer will configure your project with Core + selected specialist
**During Sessions:**
- Your selected specialist loads automatically at session startup
- Additional expertise (Packs) available on-demand via JIT loading

## Base Experts (Select ONE at Install)
The following 12 specialists are available for selection during installation. Choose the one that best matches your project's primary focus.

### 🔧 **Backend Specialist**
**File:** `Domain/Base/Backend-Specialist.md`
**Use When:**
- Building server-side applications
- Creating REST, GraphQL, or gRPC APIs
- Implementing business logic
- Working with authentication/authorization
- Background job processing
**Key Expertise:**
- Server frameworks (Django, Flask, Express, Spring Boot)
- API design and implementation
- Authentication (JWT, OAuth 2.0)
- Middleware and request processing
- Background jobs (Celery, Bull)

### 🎨 **Frontend Specialist**
**File:** `Domain/Base/Frontend-Specialist.md`
**Use When:**
- Building user interfaces
- Working with JavaScript frameworks
- Creating web applications
- Focusing on client-side logic and UX
**Key Expertise:**
- React, Vue, Angular, Svelte
- CSS architecture and styling
- Performance optimization (Core Web Vitals)
- Accessibility (WCAG)
- State management (Redux, Zustand, Pinia)

### 🔀 **Full-Stack Developer**
**File:** `Domain/Base/Full-Stack-Developer.md`
**Use When:**
- Building end-to-end web applications
- Working across frontend and backend
- Rapid prototyping and MVP development
- Solo or small team projects
**Key Expertise:**
- Frontend + Backend integration
- API contracts and database integration
- Full application lifecycle
- Cross-layer debugging

### 📱 **Mobile Specialist**
**File:** `Domain/Base/Mobile-Specialist.md`
**Use When:**
- Building native iOS or Android apps
- Cross-platform mobile development
- Mobile-specific features (push notifications, offline-first)
**Key Expertise:**
- iOS (Swift, SwiftUI, UIKit)
- Android (Kotlin, Jetpack Compose)
- Cross-platform (React Native, Flutter)
- Mobile architecture (MVVM, MVI)
- Mobile performance and offline-first

### 🖥️ **Desktop Application Developer**
**File:** `Domain/Base/Desktop-Application-Developer.md`
**Use When:**
- Building native desktop applications
- Cross-platform desktop development
- System tray utilities and background services
- Rich client applications
**Key Expertise:**
- UI frameworks (Qt, GTK, WinForms, WPF, Electron, Tauri)
- Platform APIs (Win32, Cocoa, X11)
- Cross-platform development strategies
- Packaging and distribution (installers, app stores)

### 🎮 **Game Developer**
**File:** `Domain/Base/Game-Developer.md`
**Use When:**
- Building video games
- Game engine development
- Interactive simulations
- Game systems and mechanics
**Key Expertise:**
- Game engines (Unity, Unreal, Godot)
- Game programming patterns (game loop, ECS, state machines)
- Physics and collision systems
- Graphics and rendering
- Multiplayer networking

### 🔌 **Embedded Systems Engineer**
**File:** `Domain/Base/Embedded-Systems-Engineer.md`
**Use When:**
- Firmware development
- Hardware interfacing
- Real-time systems
- IoT devices
**Key Expertise:**
- C/C++ for embedded systems
- Microcontrollers (ARM Cortex-M, AVR, ESP32)
- RTOS (FreeRTOS, Zephyr)
- Hardware protocols (UART, SPI, I2C, CAN)
- Power optimization

### ⚙️ **Systems Programmer Specialist**
**File:** `Domain/Base/Systems-Programmer-Specialist.md`
**Use When:**
- Low-level systems programming
- Operating system development
- Compiler and language implementation
- Performance-critical systems
**Key Expertise:**
- Memory management and allocation
- Concurrency primitives and synchronization
- Operating system internals
- Compiler design and implementation
- Assembly and hardware interaction

### 📊 **Data Engineer**
**File:** `Domain/Base/Data-Engineer.md`
**Use When:**
- Building data pipelines (ETL/ELT)
- Data warehousing
- Analytics infrastructure
- Big data processing
**Key Expertise:**
- Apache Spark, Airflow, dbt
- Data warehouses (Snowflake, BigQuery, Redshift)
- Stream processing (Kafka, Flink)
- Data quality and testing
- Dimensional modeling

### 🤖 **ML Engineer**
**File:** `Domain/Base/ML-Engineer.md`
**Use When:**
- Building machine learning models
- Model training and deployment (MLOps)
- Data science projects
- AI/ML features
**Key Expertise:**
- TensorFlow, PyTorch, scikit-learn
- ML lifecycle (data prep, training, deployment)
- Deep learning (CNNs, RNNs, Transformers)
- MLOps (MLflow, experiment tracking)
- Model monitoring and retraining

### ☁️ **Cloud Solutions Architect**
**File:** `Domain/Base/Cloud-Solutions-Architect.md`
**Use When:**
- Designing system architecture
- Making architectural decisions
- Multi-cloud or cloud-native architectures
- Scalability and high availability design
**Key Expertise:**
- Cloud platforms (AWS, Azure, GCP)
- Architectural patterns (microservices, serverless, event-driven)
- System design principles (CAP theorem, scalability)
- Architectural Decision Records (ADRs)
- Disaster recovery and cost optimization

### 🔥 **Site Reliability Engineer (SRE)**
**File:** `Domain/Base/SRE-Specialist.md`
**Use When:**
- Ensuring system reliability
- Managing SLOs and error budgets
- Incident response and postmortems
- Observability and monitoring
**Key Expertise:**
- SLO/SLI/SLA management
- Error budgets
- Observability (metrics, logs, traces)
- Incident management
- Chaos engineering

## Selection Decision Tree

### What is your project's primary focus?
| Focus Area | Select This Base Expert |
|------------|------------------------|
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
**What are Expertise Packs?**
Expertise Packs are specialized skill sets that can be loaded on-demand during a session when you need additional capabilities beyond your primary Base Expert.
**Available Packs:**
- **Database-Engineer** - Database design, query optimization, data modeling
- **DevOps-Engineer** - CI/CD pipelines, containerization, infrastructure
- **Security-Engineer** - Application security, OWASP, vulnerability assessment
- **Performance-Engineer** - Optimization, load testing, profiling
- **QA-Test-Engineer** - Test strategy, automation frameworks
- **Accessibility-Specialist** - WCAG compliance, assistive technology
- **API-Integration-Specialist** - Microservices, API gateways, event-driven
- **Graphics-Engineer-Specialist** - Rendering, shaders, GPU programming
- **Platform-Engineer** - Internal developer platforms, tooling
- **Technical-Writer-Specialist** - Documentation, API docs
**How JIT Loading Works:**
During a session, when you need specialized help:
1. Tell Claude: "I need database optimization help"
2. Claude loads the relevant Pack expertise on-demand
3. Your primary Base Expert remains active
4. Pack expertise is scoped to the current task
*Note: Full JIT loading implementation is planned for a future release.*

## Quick Reference Table
| Base Expert | Primary Focus | Example Use Cases |
|-------------|---------------|-------------------|
| Backend | Server-side logic, APIs | REST APIs, microservices |
| Frontend | User interfaces, client-side | SPAs, web apps, UI components |
| Full-Stack | End-to-end web apps | MVPs, solo projects |
| Mobile | iOS/Android apps | Native/cross-platform mobile |
| Desktop App | Desktop applications | Native apps, cross-platform desktop |
| Game Dev | Video games | Game engines, game mechanics |
| Embedded | Firmware, hardware | IoT, microcontrollers |
| Systems | Low-level, OS | Compilers, runtimes, drivers |
| Data | Data pipelines, warehousing | ETL, analytics, big data |
| ML | Machine learning, AI | ML models, MLOps |
| Cloud Architect | System design, architecture | Cloud architecture, scalability |
| SRE | Reliability, operations | SLOs, incident response |
**End of Domain Selection Guide**

---
name: java-maven-tests
description: Run Java tests with Maven
extensionPoints:
  - pre-validation
  - pre-gate
appliesTo:
  - prepare-release:pre-validation
  - prepare-beta:pre-validation
  - merge-branch:pre-gate
prerequisites:
  - pom.xml
technology:
  - java
---

### Run Tests

```bash
mvn test
```

**If tests fail, STOP and fix before continuing.**

# OWASP Top 10 Remediation Guide
**Version:** v0.51.1

**Framework:** IDPF-Security

---

## Overview

This guide provides remediation patterns for the OWASP Top 10 (2021) web application security risks. Each section includes vulnerable code examples and secure alternatives.

---

## OWASP Top 10 (2021) Summary

| # | Category | Risk |
|---|----------|------|
| A01 | Broken Access Control | Unauthorized access to data/functions |
| A02 | Cryptographic Failures | Exposure of sensitive data |
| A03 | Injection | Code/query injection attacks |
| A04 | Insecure Design | Missing security controls |
| A05 | Security Misconfiguration | Default/incomplete configurations |
| A06 | Vulnerable Components | Outdated dependencies |
| A07 | Authentication Failures | Identity/session weaknesses |
| A08 | Data Integrity Failures | Untrusted deserialization, CI/CD |
| A09 | Logging Failures | Insufficient monitoring |
| A10 | SSRF | Server-side request forgery |

---

## A01: Broken Access Control

### Vulnerable: Missing Authorization Check

```python
# VULNERABLE - No authorization check
@app.route('/api/users/<user_id>/profile')
def get_profile(user_id):
    user = User.query.get(user_id)
    return jsonify(user.to_dict())  # Any user can access any profile
```

### Secure: Proper Authorization

```python
# SECURE - Authorization verified
@app.route('/api/users/<user_id>/profile')
@login_required
def get_profile(user_id):
    current_user = get_current_user()

    # Verify user can only access their own profile or is admin
    if str(current_user.id) != user_id and not current_user.is_admin:
        abort(403)

    user = User.query.get_or_404(user_id)
    return jsonify(user.to_dict())
```

### Vulnerable: Insecure Direct Object Reference (IDOR)

```javascript
// VULNERABLE - Uses user-provided ID directly
app.get('/api/documents/:docId', (req, res) => {
    const doc = await Document.findById(req.params.docId);
    res.json(doc);  // No ownership check
});
```

### Secure: Ownership Verification

```javascript
// SECURE - Verifies ownership
app.get('/api/documents/:docId', authenticate, async (req, res) => {
    const doc = await Document.findOne({
        _id: req.params.docId,
        $or: [
            { owner: req.user.id },
            { sharedWith: req.user.id },
            { isPublic: true }
        ]
    });

    if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
    }

    res.json(doc);
});
```

### Access Control Patterns

```python
# Role-Based Access Control (RBAC)
from functools import wraps

def require_role(*roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if not current_user.is_authenticated:
                abort(401)
            if current_user.role not in roles:
                abort(403)
            return f(*args, **kwargs)
        return decorated_function
    return decorator

@app.route('/admin/users')
@require_role('admin', 'superadmin')
def admin_users():
    return render_template('admin/users.html')
```

---

## A02: Cryptographic Failures

### Vulnerable: Weak Hashing

```python
# VULNERABLE - MD5 is broken for passwords
import hashlib

def hash_password(password):
    return hashlib.md5(password.encode()).hexdigest()
```

### Secure: Proper Password Hashing

```python
# SECURE - bcrypt with proper work factor
import bcrypt

def hash_password(password: str) -> bytes:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode('utf-8'), salt)

def verify_password(password: str, hashed: bytes) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed)
```

### Vulnerable: Hardcoded Secrets

```java
// VULNERABLE - Hardcoded encryption key
public class Encryptor {
    private static final String SECRET_KEY = "MySecretKey12345";  // Hardcoded!

    public String encrypt(String data) {
        // Uses hardcoded key
    }
}
```

### Secure: External Key Management

```java
// SECURE - Keys from secure storage
public class Encryptor {
    private final SecretKey secretKey;

    public Encryptor(KeyManager keyManager) {
        this.secretKey = keyManager.getKey("encryption-key");
    }

    public String encrypt(String data) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        byte[] iv = new byte[12];
        SecureRandom.getInstanceStrong().nextBytes(iv);

        GCMParameterSpec spec = new GCMParameterSpec(128, iv);
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, spec);

        byte[] encrypted = cipher.doFinal(data.getBytes(StandardCharsets.UTF_8));

        // Prepend IV to ciphertext
        byte[] result = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, result, 0, iv.length);
        System.arraycopy(encrypted, 0, result, iv.length, encrypted.length);

        return Base64.getEncoder().encodeToString(result);
    }
}
```

### Data Protection Checklist

```yaml
data_protection:
  at_rest:
    - Use AES-256-GCM for symmetric encryption
    - Use RSA-2048+ or ECDSA for asymmetric
    - Never store plaintext passwords
    - Encrypt PII and sensitive data

  in_transit:
    - TLS 1.2+ only
    - Strong cipher suites
    - Certificate validation
    - HSTS headers

  key_management:
    - Use HSM or KMS for production keys
    - Rotate keys regularly
    - Never hardcode keys
    - Separate keys per environment
```

---

## A03: Injection

### Vulnerable: SQL Injection

```python
# VULNERABLE - String concatenation in SQL
def get_user(username):
    query = f"SELECT * FROM users WHERE username = '{username}'"
    return db.execute(query).fetchone()

# Attack: username = "' OR '1'='1' --"
```

### Secure: Parameterized Queries

```python
# SECURE - Parameterized query
def get_user(username):
    query = "SELECT * FROM users WHERE username = ?"
    return db.execute(query, (username,)).fetchone()

# ORM alternative
def get_user_orm(username):
    return User.query.filter_by(username=username).first()
```

### Vulnerable: Command Injection

```python
# VULNERABLE - Shell command with user input
import os

def ping_host(hostname):
    os.system(f"ping -c 4 {hostname}")  # hostname = "; rm -rf /"
```

### Secure: Avoid Shell, Use Libraries

```python
# SECURE - Use subprocess with shell=False
import subprocess
import shlex

def ping_host(hostname):
    # Validate hostname format
    if not re.match(r'^[a-zA-Z0-9.-]+$', hostname):
        raise ValueError("Invalid hostname")

    result = subprocess.run(
        ['ping', '-c', '4', hostname],
        capture_output=True,
        text=True,
        timeout=30
    )
    return result.stdout
```

### Vulnerable: XSS (Cross-Site Scripting)

```javascript
// VULNERABLE - Direct HTML injection
document.getElementById('output').innerHTML = userInput;

// VULNERABLE - Unescaped template
app.get('/search', (req, res) => {
    res.send(`<h1>Results for: ${req.query.q}</h1>`);
});
```

### Secure: Output Encoding

```javascript
// SECURE - Use textContent for text
document.getElementById('output').textContent = userInput;

// SECURE - Template with auto-escaping (EJS)
app.get('/search', (req, res) => {
    res.render('search', { query: req.query.q });  // Auto-escaped
});

// SECURE - Manual encoding when needed
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}
```

### Content Security Policy

```python
# Flask CSP middleware
@app.after_request
def add_security_headers(response):
    response.headers['Content-Security-Policy'] = (
        "default-src 'self'; "
        "script-src 'self' 'nonce-{nonce}'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "connect-src 'self' https://api.example.com; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    return response
```

---

## A04: Insecure Design

### Security Requirements Template

```markdown
## Feature: User Authentication

### Security Requirements

1. **Password Policy**
   - Minimum 12 characters
   - Require complexity (upper, lower, number, special)
   - Check against breached password database

2. **Rate Limiting**
   - 5 failed attempts per IP per 15 minutes
   - 3 failed attempts per account per 5 minutes
   - Progressive delays after failures

3. **Session Management**
   - Secure, HttpOnly, SameSite cookies
   - 30-minute idle timeout
   - Regenerate session ID on login

4. **MFA Requirement**
   - Required for admin accounts
   - Optional but encouraged for all users
```

### Threat Modeling Integration

```python
# security/threat_model.py
"""
Threat Model: Payment Processing

## Assets
- Credit card numbers (PCI DSS scope)
- Transaction records

## Threats (STRIDE)
- Spoofing: Fraudulent transactions
- Tampering: Amount modification
- Repudiation: Transaction denial
- Info Disclosure: Card data leak
- DoS: Payment system unavailability
- EoP: Unauthorized refunds

## Mitigations Implemented
"""

class PaymentProcessor:
    def process_payment(self, card_data, amount, user):
        # Mitigation: Authenticate user
        if not user.is_authenticated:
            raise AuthenticationRequired()

        # Mitigation: Validate amount
        if amount <= 0 or amount > MAX_TRANSACTION:
            raise InvalidAmount()

        # Mitigation: Tokenize card (never store raw)
        token = self.tokenization_service.tokenize(card_data)

        # Mitigation: Create audit record
        audit_log.record(
            action='payment_initiated',
            user_id=user.id,
            amount=amount,
            ip=request.remote_addr,
            timestamp=datetime.utcnow()
        )

        # Mitigation: Use idempotency key
        result = self.gateway.charge(
            token=token,
            amount=amount,
            idempotency_key=generate_idempotency_key()
        )

        return result
```

---

## A05: Security Misconfiguration

### Vulnerable: Debug Mode in Production

```python
# VULNERABLE - Debug mode exposes stack traces
app = Flask(__name__)
app.config['DEBUG'] = True  # Never in production!
```

### Secure: Environment-Based Configuration

```python
# SECURE - Environment-based config
import os

class Config:
    DEBUG = False
    TESTING = False
    SECRET_KEY = os.environ.get('SECRET_KEY')

class ProductionConfig(Config):
    DEBUG = False

class DevelopmentConfig(Config):
    DEBUG = True

# Load based on environment
config_map = {
    'production': ProductionConfig,
    'development': DevelopmentConfig,
}

app.config.from_object(config_map[os.environ.get('FLASK_ENV', 'production')])
```

### Security Headers Configuration

```python
# Comprehensive security headers
@app.after_request
def add_security_headers(response):
    headers = {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Content-Security-Policy': "default-src 'self'",
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
        'Cache-Control': 'no-store, max-age=0'
    }

    for header, value in headers.items():
        response.headers[header] = value

    return response
```

### CORS Configuration

```javascript
// VULNERABLE - Overly permissive CORS
app.use(cors({
    origin: '*',  // Allows any origin
    credentials: true  // Dangerous with wildcard origin
}));

// SECURE - Restricted CORS
const allowedOrigins = [
    'https://app.example.com',
    'https://admin.example.com'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS not allowed'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
```

---

## A06: Vulnerable and Outdated Components

### Dependency Scanning

```yaml
# .github/workflows/dependency-check.yml
name: Dependency Security Check

on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '0 0 * * *'  # Daily

jobs:
  npm-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run npm audit
        run: npm audit --audit-level=moderate

      - name: Check for high/critical
        run: |
          VULNS=$(npm audit --json | jq '.metadata.vulnerabilities.high + .metadata.vulnerabilities.critical')
          if [ "$VULNS" -gt 0 ]; then
            echo "Found $VULNS high/critical vulnerabilities"
            exit 1
          fi

  python-safety:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install safety
        run: pip install safety

      - name: Run safety check
        run: safety check -r requirements.txt --full-report

  snyk-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high
```

### Automated Updates

```yaml
# .github/dependabot.yml
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    groups:
      production-dependencies:
        patterns:
          - "*"
        exclude-patterns:
          - "@types/*"
          - "eslint*"
          - "jest*"

  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"
    ignore:
      - dependency-name: "*"
        update-types: ["version-update:semver-major"]
```

---

## A07: Identification and Authentication Failures

### Vulnerable: Weak Password Storage

```python
# VULNERABLE - Plain text or weak hash
def create_user(username, password):
    user = User(
        username=username,
        password=password  # Plain text!
    )
    db.session.add(user)
```

### Secure: Strong Password Handling

```python
# SECURE - Proper password handling
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4
)

def create_user(username: str, password: str) -> User:
    # Validate password strength
    if not is_strong_password(password):
        raise WeakPasswordError("Password does not meet requirements")

    # Check breached passwords
    if is_breached_password(password):
        raise BreachedPasswordError("Password found in breach database")

    user = User(
        username=username,
        password_hash=ph.hash(password)
    )
    db.session.add(user)
    return user

def verify_user(username: str, password: str) -> Optional[User]:
    user = User.query.filter_by(username=username).first()
    if not user:
        # Timing-safe comparison to prevent enumeration
        ph.hash(password)  # Waste same amount of time
        return None

    try:
        ph.verify(user.password_hash, password)

        # Rehash if parameters changed
        if ph.check_needs_rehash(user.password_hash):
            user.password_hash = ph.hash(password)
            db.session.commit()

        return user
    except VerifyMismatchError:
        return None
```

### Session Security

```python
# Secure session configuration
from flask import Flask, session
from datetime import timedelta

app = Flask(__name__)

app.config.update(
    SECRET_KEY=os.environ['SECRET_KEY'],
    SESSION_COOKIE_SECURE=True,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE='Lax',
    PERMANENT_SESSION_LIFETIME=timedelta(hours=1),
    SESSION_REFRESH_EACH_REQUEST=True
)

@app.route('/login', methods=['POST'])
def login():
    user = authenticate(request.form['username'], request.form['password'])
    if user:
        # Regenerate session ID to prevent fixation
        session.regenerate()
        session['user_id'] = user.id
        session['login_time'] = datetime.utcnow().isoformat()
        return redirect(url_for('dashboard'))
    return render_template('login.html', error='Invalid credentials')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('home'))
```

### Rate Limiting

```python
# Rate limiting for authentication
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

@app.route('/login', methods=['POST'])
@limiter.limit("5 per minute")
@limiter.limit("20 per hour")
def login():
    # Login logic
    pass

@app.route('/api/password-reset', methods=['POST'])
@limiter.limit("3 per hour")
def password_reset():
    # Password reset logic
    pass
```

---

## A08: Software and Data Integrity Failures

### Vulnerable: Insecure Deserialization

```python
# VULNERABLE - Deserializing untrusted data
import pickle

@app.route('/api/data', methods=['POST'])
def process_data():
    data = pickle.loads(request.data)  # Remote code execution risk!
    return jsonify(data)
```

### Secure: Safe Data Formats

```python
# SECURE - Use safe formats with validation
import json
from marshmallow import Schema, fields, validate

class DataSchema(Schema):
    name = fields.Str(required=True, validate=validate.Length(max=100))
    value = fields.Int(required=True, validate=validate.Range(min=0, max=1000))

@app.route('/api/data', methods=['POST'])
def process_data():
    try:
        schema = DataSchema()
        data = schema.load(request.json)
        return jsonify(data)
    except ValidationError as e:
        return jsonify({'errors': e.messages}), 400
```

### CI/CD Pipeline Security

```yaml
# .github/workflows/secure-pipeline.yml
name: Secure Build Pipeline

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Full history for signing verification

      - name: Verify commit signatures
        run: |
          git log --show-signature -1 HEAD

      - name: Generate SBOM
        uses: anchore/sbom-action@v0
        with:
          format: spdx-json

      - name: Sign artifacts
        uses: sigstore/cosign-installer@main

      - name: Build and sign container
        run: |
          docker build -t myapp:${{ github.sha }} .
          cosign sign myapp:${{ github.sha }}
```

---

## A09: Security Logging and Monitoring Failures

### Vulnerable: No Security Logging

```python
# VULNERABLE - No logging of security events
@app.route('/login', methods=['POST'])
def login():
    user = authenticate(request.form['username'], request.form['password'])
    if user:
        return redirect('/dashboard')
    return render_template('login.html', error='Invalid')  # No logging!
```

### Secure: Comprehensive Security Logging

```python
# SECURE - Structured security logging
import logging
import json
from datetime import datetime

security_logger = logging.getLogger('security')

def log_security_event(event_type: str, details: dict, level: str = 'INFO'):
    """Log security events in structured format."""
    event = {
        'timestamp': datetime.utcnow().isoformat(),
        'event_type': event_type,
        'ip_address': request.remote_addr,
        'user_agent': request.user_agent.string,
        'user_id': getattr(current_user, 'id', None),
        **details
    }

    log_func = getattr(security_logger, level.lower())
    log_func(json.dumps(event))

@app.route('/login', methods=['POST'])
def login():
    username = request.form['username']
    user = authenticate(username, request.form['password'])

    if user:
        log_security_event('LOGIN_SUCCESS', {
            'username': username,
            'auth_method': 'password'
        })
        return redirect('/dashboard')

    log_security_event('LOGIN_FAILURE', {
        'username': username,
        'reason': 'invalid_credentials'
    }, level='WARNING')

    return render_template('login.html', error='Invalid')

@app.route('/admin/users/<user_id>', methods=['DELETE'])
@require_admin
def delete_user(user_id):
    log_security_event('ADMIN_ACTION', {
        'action': 'delete_user',
        'target_user_id': user_id
    })
    # Delete logic
```

### Alerting Configuration

```yaml
# prometheus/security-alerts.yml
groups:
  - name: security_alerts
    rules:
      - alert: BruteForceAttempt
        expr: |
          sum(rate(login_failures_total[5m])) by (ip_address) > 10
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Possible brute force from {{ $labels.ip_address }}"

      - alert: SuspiciousAdminActivity
        expr: |
          sum(rate(admin_actions_total[1h])) by (user_id) > 50
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High admin activity from user {{ $labels.user_id }}"

      - alert: UnauthorizedAccessAttempt
        expr: |
          sum(rate(authorization_failures_total[5m])) by (user_id) > 5
        for: 2m
        labels:
          severity: warning
```

---

## A10: Server-Side Request Forgery (SSRF)

### Vulnerable: Unvalidated URL Fetch

```python
# VULNERABLE - Fetches any URL
import requests

@app.route('/api/fetch')
def fetch_url():
    url = request.args.get('url')
    response = requests.get(url)  # Can access internal services!
    return response.content
```

### Secure: URL Validation and Allowlisting

```python
# SECURE - Validate and restrict URLs
import ipaddress
from urllib.parse import urlparse
import socket

ALLOWED_HOSTS = ['api.example.com', 'cdn.example.com']
BLOCKED_NETWORKS = [
    ipaddress.ip_network('10.0.0.0/8'),
    ipaddress.ip_network('172.16.0.0/12'),
    ipaddress.ip_network('192.168.0.0/16'),
    ipaddress.ip_network('127.0.0.0/8'),
    ipaddress.ip_network('169.254.0.0/16'),
]

def is_safe_url(url: str) -> bool:
    """Validate URL is safe to fetch."""
    try:
        parsed = urlparse(url)

        # Only allow HTTPS
        if parsed.scheme != 'https':
            return False

        # Check against allowlist
        if ALLOWED_HOSTS and parsed.hostname not in ALLOWED_HOSTS:
            return False

        # Resolve hostname and check IP
        ip = socket.gethostbyname(parsed.hostname)
        ip_addr = ipaddress.ip_address(ip)

        for network in BLOCKED_NETWORKS:
            if ip_addr in network:
                return False

        return True
    except Exception:
        return False

@app.route('/api/fetch')
def fetch_url():
    url = request.args.get('url')

    if not is_safe_url(url):
        return jsonify({'error': 'URL not allowed'}), 400

    # Use timeout and disable redirects
    response = requests.get(
        url,
        timeout=5,
        allow_redirects=False,
        headers={'User-Agent': 'MyApp/1.0'}
    )

    return response.content
```

### Network-Level Protection

```yaml
# Kubernetes NetworkPolicy to prevent SSRF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: restrict-egress
spec:
  podSelector:
    matchLabels:
      app: web-app
  policyTypes:
    - Egress
  egress:
    # Allow DNS
    - to:
        - namespaceSelector: {}
      ports:
        - protocol: UDP
          port: 53
    # Allow specific external services
    - to:
        - ipBlock:
            cidr: 203.0.113.0/24  # External API
      ports:
        - protocol: TCP
          port: 443
    # Block metadata services
    - to:
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - 169.254.169.254/32  # AWS metadata
              - 10.0.0.0/8
              - 172.16.0.0/12
              - 192.168.0.0/16
```

---

## Remediation Priority Matrix

| Vulnerability | Exploitability | Impact | Priority |
|---------------|----------------|--------|----------|
| SQL Injection | High | Critical | P0 - Immediate |
| Command Injection | High | Critical | P0 - Immediate |
| Broken Access Control | High | High | P0 - Immediate |
| SSRF to Internal Services | Medium | High | P1 - This Sprint |
| XSS (Stored) | Medium | Medium | P1 - This Sprint |
| Insecure Deserialization | Low | Critical | P1 - This Sprint |
| Weak Cryptography | Low | High | P2 - Next Sprint |
| Security Misconfiguration | Medium | Medium | P2 - Next Sprint |
| Outdated Components | Varies | Varies | P2 - Regular Updates |
| Insufficient Logging | N/A | N/A | P3 - Continuous |

---

## Testing Checklist

```markdown
## Security Testing Checklist by OWASP Category

### A01: Access Control
- [ ] Test horizontal privilege escalation (IDOR)
- [ ] Test vertical privilege escalation
- [ ] Verify authorization on all API endpoints
- [ ] Test direct object references

### A02: Cryptographic Failures
- [ ] Verify password hashing strength
- [ ] Check TLS configuration
- [ ] Verify no sensitive data in logs
- [ ] Check encryption at rest

### A03: Injection
- [ ] Test SQL injection points
- [ ] Test command injection
- [ ] Test XSS (reflected, stored, DOM)
- [ ] Test template injection

### A04: Insecure Design
- [ ] Review threat model
- [ ] Verify security requirements
- [ ] Check abuse case handling

### A05: Security Misconfiguration
- [ ] Verify security headers
- [ ] Check CORS configuration
- [ ] Review error handling
- [ ] Verify debug mode disabled

### A06: Vulnerable Components
- [ ] Run dependency scan
- [ ] Check for known CVEs
- [ ] Verify update process

### A07: Authentication Failures
- [ ] Test password policy
- [ ] Test rate limiting
- [ ] Verify session management
- [ ] Test account lockout

### A08: Data Integrity
- [ ] Review deserialization
- [ ] Verify CI/CD security
- [ ] Check artifact signing

### A09: Logging Failures
- [ ] Verify security event logging
- [ ] Check log format
- [ ] Test alerting rules

### A10: SSRF
- [ ] Test URL validation
- [ ] Check internal network access
- [ ] Verify allowlist enforcement
```

---

*Guide from IDPF-Security Framework*

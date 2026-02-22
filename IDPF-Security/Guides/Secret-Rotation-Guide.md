# Secret Rotation Guide
**Version:** v0.48.3

**Framework:** IDPF-Security

---

## Overview

Secret rotation limits exposure from compromised credentials. This guide covers rotation strategies, automation approaches, and integration with secret management systems.

---

## Why Rotate Secrets

| Risk | Mitigation via Rotation |
|------|------------------------|
| Credential theft | Limits window of exploitation |
| Insider threats | Reduces long-term access risk |
| Compliance requirements | Meets audit standards |
| Key compromise | Minimizes blast radius |

---

## Secret Categories and Rotation Frequency

| Secret Type | Recommended Frequency | Notes |
|-------------|----------------------|-------|
| API keys | 90 days | Automated rotation preferred |
| Database passwords | 90 days | Use connection pooling |
| Service account tokens | 30-90 days | Depends on sensitivity |
| SSH keys | 90-180 days | Consider certificate-based auth |
| TLS certificates | Before expiry (auto-renew) | Use ACME/Let's Encrypt |
| Encryption keys | Annually | Key versioning required |
| JWT signing keys | 30-90 days | Support key rotation in verification |

---

## Rotation Patterns

### Pattern 1: Blue-Green Rotation

```
┌─────────────────────────────────────────────────────────────┐
│                    Blue-Green Rotation                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Phase 1: Create          Phase 2: Transition   Phase 3: Retire  │
│  ┌─────────────┐         ┌─────────────┐       ┌─────────────┐   │
│  │ Old Key     │ ───────→│ Both Keys   │──────→│ New Key     │   │
│  │ (active)    │         │ (active)    │       │ (active)    │   │
│  │             │         │             │       │             │   │
│  │ New Key     │         │ Old Key     │       │ Old Key     │   │
│  │ (created)   │         │ (valid)     │       │ (revoked)   │   │
│  └─────────────┘         └─────────────┘       └─────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Pattern 2: Rolling Rotation (Zero Downtime)

```yaml
# kubernetes/secret-rotation-job.yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: db-credential-rotation
spec:
  schedule: "0 2 1 */3 *"  # Quarterly at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: rotate
              image: rotation-handler:latest
              env:
                - name: SECRET_NAME
                  value: "db-credentials"
                - name: VAULT_ADDR
                  valueFrom:
                    secretKeyRef:
                      name: vault-config
                      key: address
              command:
                - /bin/sh
                - -c
                - |
                  # 1. Generate new credentials
                  NEW_PASS=$(openssl rand -base64 32)

                  # 2. Update database user
                  psql -c "ALTER USER app_user PASSWORD '$NEW_PASS'"

                  # 3. Update Kubernetes secret
                  kubectl create secret generic db-credentials \
                    --from-literal=password="$NEW_PASS" \
                    --dry-run=client -o yaml | kubectl apply -f -

                  # 4. Trigger rolling restart
                  kubectl rollout restart deployment/app
          restartPolicy: OnFailure
```

---

## Secret Manager Integration

### AWS Secrets Manager

```python
# aws_rotation.py
import boto3
import json
from datetime import datetime

def rotate_secret(secret_id: str) -> dict:
    """Rotate a secret in AWS Secrets Manager."""
    client = boto3.client('secretsmanager')

    # Step 1: Create new version
    response = client.rotate_secret(
        SecretId=secret_id,
        RotationLambdaARN='arn:aws:lambda:region:account:function:rotation-function'
    )

    return {
        'secret_id': secret_id,
        'version_id': response['VersionId'],
        'rotated_at': datetime.utcnow().isoformat()
    }

def get_rotation_status(secret_id: str) -> dict:
    """Check rotation status and last rotation date."""
    client = boto3.client('secretsmanager')

    response = client.describe_secret(SecretId=secret_id)

    return {
        'rotation_enabled': response.get('RotationEnabled', False),
        'rotation_rules': response.get('RotationRules', {}),
        'last_rotated': response.get('LastRotatedDate'),
        'next_rotation': response.get('NextRotationDate')
    }
```

**Lambda Rotation Function:**

```python
# rotation_lambda.py
import boto3
import json
import secrets
import string

def lambda_handler(event, context):
    """AWS Secrets Manager rotation Lambda."""

    secret_id = event['SecretId']
    step = event['Step']
    token = event['ClientRequestToken']

    client = boto3.client('secretsmanager')

    if step == 'createSecret':
        # Generate new secret value
        new_password = generate_password()
        client.put_secret_value(
            SecretId=secret_id,
            ClientRequestToken=token,
            SecretString=json.dumps({'password': new_password}),
            VersionStages=['AWSPENDING']
        )

    elif step == 'setSecret':
        # Update the resource with new secret
        pending = get_secret_value(client, secret_id, 'AWSPENDING')
        update_database_password(pending['password'])

    elif step == 'testSecret':
        # Verify new secret works
        pending = get_secret_value(client, secret_id, 'AWSPENDING')
        test_database_connection(pending['password'])

    elif step == 'finishSecret':
        # Mark new version as current
        client.update_secret_version_stage(
            SecretId=secret_id,
            VersionStage='AWSCURRENT',
            MoveToVersionId=token,
            RemoveFromVersionId=get_current_version(client, secret_id)
        )

def generate_password(length=32):
    alphabet = string.ascii_letters + string.digits + string.punctuation
    return ''.join(secrets.choice(alphabet) for _ in range(length))
```

### HashiCorp Vault

```bash
# Enable database secrets engine
vault secrets enable database

# Configure database connection
vault write database/config/myapp-db \
  plugin_name=postgresql-database-plugin \
  connection_url="postgresql://{{username}}:{{password}}@db.example.com:5432/myapp" \
  allowed_roles="myapp-role" \
  username="vault_admin" \
  password="initial_password"

# Create role with rotation
vault write database/roles/myapp-role \
  db_name=myapp-db \
  creation_statements="CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';" \
  default_ttl="1h" \
  max_ttl="24h"

# Rotate root credentials
vault write -force database/rotate-root/myapp-db
```

**Vault Agent for Applications:**

```hcl
# vault-agent-config.hcl
auto_auth {
  method "kubernetes" {
    mount_path = "auth/kubernetes"
    config = {
      role = "myapp"
    }
  }

  sink "file" {
    config = {
      path = "/vault/token"
    }
  }
}

template {
  source      = "/vault/templates/db-creds.tpl"
  destination = "/vault/secrets/db-creds.json"
  perms       = "0600"

  # Trigger application reload on secret change
  command     = "pkill -SIGHUP myapp"
}
```

### Azure Key Vault

```python
# azure_rotation.py
from azure.identity import DefaultAzureCredential
from azure.keyvault.secrets import SecretClient
from datetime import datetime, timedelta

def setup_rotation_policy(vault_url: str, secret_name: str):
    """Configure automatic rotation in Azure Key Vault."""
    credential = DefaultAzureCredential()
    client = SecretClient(vault_url=vault_url, credential=credential)

    # Set rotation policy
    policy = client.update_secret_rotation_policy(
        secret_name,
        lifetime_actions=[
            {
                "trigger": {
                    "time_before_expiry": "P30D"  # 30 days before expiry
                },
                "action": {
                    "type": "Notify"
                }
            },
            {
                "trigger": {
                    "time_before_expiry": "P7D"  # 7 days before expiry
                },
                "action": {
                    "type": "Rotate"
                }
            }
        ],
        expires_in="P90D"  # Secret expires in 90 days
    )

    return policy
```

---

## Application Integration

### Graceful Secret Reload

```python
# secret_watcher.py
import threading
import time
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class SecretReloader:
    """Watch for secret file changes and reload gracefully."""

    def __init__(self, secret_path: str, on_reload: callable):
        self.secret_path = secret_path
        self.on_reload = on_reload
        self._current_secret = None
        self._lock = threading.Lock()

    def start(self):
        """Start watching for secret changes."""
        handler = SecretFileHandler(self._handle_change)
        observer = Observer()
        observer.schedule(handler, self.secret_path, recursive=False)
        observer.start()

    def _handle_change(self, event):
        """Handle secret file change."""
        with self._lock:
            new_secret = self._load_secret()
            if new_secret != self._current_secret:
                self._current_secret = new_secret
                self.on_reload(new_secret)

    def get_secret(self):
        """Get current secret value."""
        with self._lock:
            if self._current_secret is None:
                self._current_secret = self._load_secret()
            return self._current_secret

# Usage
def on_db_credential_change(new_creds):
    """Called when database credentials change."""
    db_pool.update_credentials(new_creds)
    logger.info("Database credentials rotated successfully")

reloader = SecretReloader('/vault/secrets/db-creds.json', on_db_credential_change)
reloader.start()
```

### Connection Pool Credential Update

```python
# db_pool.py
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool
import threading

class RotatableConnectionPool:
    """Database connection pool that supports credential rotation."""

    def __init__(self, base_url: str):
        self.base_url = base_url
        self._engine = None
        self._lock = threading.Lock()

    def update_credentials(self, credentials: dict):
        """Update credentials and recreate pool."""
        with self._lock:
            # Build new connection URL
            url = f"postgresql://{credentials['username']}:{credentials['password']}@{self.base_url}"

            # Create new engine
            new_engine = create_engine(
                url,
                poolclass=QueuePool,
                pool_size=10,
                pool_pre_ping=True,  # Validate connections
                pool_recycle=3600    # Recycle connections hourly
            )

            # Swap engines
            old_engine = self._engine
            self._engine = new_engine

            # Dispose old engine (closes all connections gracefully)
            if old_engine:
                old_engine.dispose()

    def get_connection(self):
        """Get a connection from the pool."""
        with self._lock:
            return self._engine.connect()
```

---

## JWT Key Rotation

### JWKS Endpoint Implementation

```python
# jwks.py
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend
import json
import time
from typing import List, Dict

class JWKSManager:
    """Manage rotating JWT signing keys with JWKS endpoint."""

    def __init__(self, rotation_period_days: int = 30):
        self.rotation_period = rotation_period_days * 86400
        self.keys: List[Dict] = []
        self.current_key_id = None

    def generate_key(self) -> Dict:
        """Generate a new RSA key pair."""
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend()
        )

        key_id = f"key-{int(time.time())}"

        public_key = private_key.public_key()
        public_numbers = public_key.public_numbers()

        # JWK format
        jwk = {
            "kty": "RSA",
            "kid": key_id,
            "use": "sig",
            "alg": "RS256",
            "n": self._int_to_base64(public_numbers.n),
            "e": self._int_to_base64(public_numbers.e),
            "created_at": int(time.time())
        }

        return {
            "kid": key_id,
            "private_key": private_key,
            "jwk": jwk
        }

    def rotate(self):
        """Rotate keys - create new, keep old for verification."""
        new_key = self.generate_key()

        # Add new key
        self.keys.append(new_key)
        self.current_key_id = new_key["kid"]

        # Remove expired keys (keep keys for 2x rotation period)
        cutoff = time.time() - (2 * self.rotation_period)
        self.keys = [k for k in self.keys if k["jwk"]["created_at"] > cutoff]

    def get_signing_key(self):
        """Get current key for signing tokens."""
        for key in self.keys:
            if key["kid"] == self.current_key_id:
                return key["kid"], key["private_key"]
        raise ValueError("No current signing key")

    def get_jwks(self) -> Dict:
        """Get JWKS for public endpoint."""
        return {
            "keys": [key["jwk"] for key in self.keys]
        }
```

### Token Verification with Key Rotation

```python
# token_verifier.py
import jwt
import requests
from functools import lru_cache
from datetime import datetime, timedelta

class TokenVerifier:
    """Verify JWTs with automatic JWKS refresh."""

    def __init__(self, jwks_url: str, cache_ttl: int = 300):
        self.jwks_url = jwks_url
        self.cache_ttl = cache_ttl
        self._jwks_cache = None
        self._cache_expires = None

    def _get_jwks(self) -> dict:
        """Get JWKS, using cache if valid."""
        now = datetime.utcnow()

        if self._jwks_cache and self._cache_expires > now:
            return self._jwks_cache

        response = requests.get(self.jwks_url, timeout=5)
        response.raise_for_status()

        self._jwks_cache = response.json()
        self._cache_expires = now + timedelta(seconds=self.cache_ttl)

        return self._jwks_cache

    def _get_public_key(self, kid: str):
        """Get public key by key ID."""
        jwks = self._get_jwks()

        for key in jwks.get("keys", []):
            if key["kid"] == kid:
                return jwt.algorithms.RSAAlgorithm.from_jwk(key)

        # Key not found, force refresh cache
        self._cache_expires = None
        jwks = self._get_jwks()

        for key in jwks.get("keys", []):
            if key["kid"] == kid:
                return jwt.algorithms.RSAAlgorithm.from_jwk(key)

        raise ValueError(f"Key {kid} not found in JWKS")

    def verify(self, token: str) -> dict:
        """Verify token and return claims."""
        # Get key ID from header without verification
        unverified = jwt.get_unverified_header(token)
        kid = unverified.get("kid")

        if not kid:
            raise ValueError("Token missing kid header")

        public_key = self._get_public_key(kid)

        return jwt.decode(
            token,
            public_key,
            algorithms=["RS256"],
            options={"require": ["exp", "iat", "sub"]}
        )
```

---

## API Key Rotation

### Dual-Key Pattern

```python
# api_key_rotation.py
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional
import secrets
import hashlib

@dataclass
class APIKey:
    key_id: str
    key_hash: str
    created_at: datetime
    expires_at: datetime
    is_primary: bool

class APIKeyManager:
    """Manage API keys with rotation support."""

    def __init__(self, db_session):
        self.db = db_session

    def generate_key(self) -> str:
        """Generate a new API key."""
        return f"sk_{secrets.token_urlsafe(32)}"

    def hash_key(self, key: str) -> str:
        """Hash API key for storage."""
        return hashlib.sha256(key.encode()).hexdigest()

    def create_key(self, user_id: str, expires_days: int = 90) -> tuple[str, APIKey]:
        """Create a new API key for a user."""
        raw_key = self.generate_key()
        key_hash = self.hash_key(raw_key)

        api_key = APIKey(
            key_id=f"key_{secrets.token_urlsafe(8)}",
            key_hash=key_hash,
            created_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=expires_days),
            is_primary=True
        )

        # Demote existing primary key
        self.db.execute(
            "UPDATE api_keys SET is_primary = FALSE WHERE user_id = :user_id AND is_primary = TRUE",
            {"user_id": user_id}
        )

        # Insert new key
        self.db.execute(
            """INSERT INTO api_keys (key_id, user_id, key_hash, created_at, expires_at, is_primary)
               VALUES (:key_id, :user_id, :key_hash, :created_at, :expires_at, :is_primary)""",
            {
                "key_id": api_key.key_id,
                "user_id": user_id,
                "key_hash": api_key.key_hash,
                "created_at": api_key.created_at,
                "expires_at": api_key.expires_at,
                "is_primary": api_key.is_primary
            }
        )

        return raw_key, api_key

    def validate_key(self, raw_key: str) -> Optional[str]:
        """Validate API key and return user_id if valid."""
        key_hash = self.hash_key(raw_key)

        result = self.db.execute(
            """SELECT user_id FROM api_keys
               WHERE key_hash = :key_hash
               AND expires_at > :now
               AND revoked_at IS NULL""",
            {"key_hash": key_hash, "now": datetime.utcnow()}
        ).fetchone()

        return result[0] if result else None

    def rotate_key(self, user_id: str) -> tuple[str, APIKey]:
        """Rotate API key - creates new primary, keeps old as secondary."""
        return self.create_key(user_id)

    def revoke_key(self, key_id: str):
        """Revoke a specific API key."""
        self.db.execute(
            "UPDATE api_keys SET revoked_at = :now WHERE key_id = :key_id",
            {"now": datetime.utcnow(), "key_id": key_id}
        )
```

---

## Rotation Automation

### GitHub Actions Workflow

```yaml
# .github/workflows/secret-rotation.yml
name: Secret Rotation

on:
  schedule:
    - cron: '0 3 1 */3 *'  # Quarterly at 3 AM on the 1st
  workflow_dispatch:
    inputs:
      secret_type:
        description: 'Secret type to rotate'
        required: true
        type: choice
        options:
          - database
          - api-keys
          - all

jobs:
  rotate-secrets:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROTATION_ROLE }}
          aws-region: us-east-1

      - name: Rotate database credentials
        if: inputs.secret_type == 'database' || inputs.secret_type == 'all'
        run: |
          aws secretsmanager rotate-secret \
            --secret-id prod/database/credentials

      - name: Rotate API keys
        if: inputs.secret_type == 'api-keys' || inputs.secret_type == 'all'
        run: |
          python scripts/rotate_api_keys.py \
            --environment production

      - name: Verify rotations
        run: |
          python scripts/verify_rotation.py \
            --check-connectivity \
            --alert-on-failure

      - name: Notify on completion
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "Secret rotation completed for ${{ inputs.secret_type || 'scheduled' }}"
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### Rotation Monitoring

```yaml
# prometheus/alerts/rotation-alerts.yml
groups:
  - name: secret_rotation
    rules:
      - alert: SecretRotationOverdue
        expr: |
          (time() - secret_last_rotation_timestamp) > (90 * 24 * 60 * 60)
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Secret rotation overdue for {{ $labels.secret_name }}"
          description: "Secret {{ $labels.secret_name }} hasn't been rotated in over 90 days"

      - alert: SecretExpiringSoon
        expr: |
          (secret_expiration_timestamp - time()) < (7 * 24 * 60 * 60)
        for: 1h
        labels:
          severity: critical
        annotations:
          summary: "Secret expiring soon: {{ $labels.secret_name }}"
          description: "Secret {{ $labels.secret_name }} expires in less than 7 days"

      - alert: SecretRotationFailed
        expr: |
          secret_rotation_failures_total > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Secret rotation failed for {{ $labels.secret_name }}"
```

---

## Best Practices

| Practice | Rationale |
|----------|-----------|
| Automate rotation | Reduces human error and ensures consistency |
| Support dual keys during transition | Prevents service disruption |
| Monitor rotation status | Catch failures before expiration |
| Test rotation procedures | Verify recovery works before needed |
| Document rotation runbooks | Enable manual rotation if automation fails |
| Audit rotation events | Compliance and security visibility |

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Manual-only rotation | Inconsistent, error-prone | Automate with scheduled jobs |
| Single key cutover | Service disruption risk | Use blue-green or rolling rotation |
| No rotation testing | Failures discovered in production | Test rotation in staging regularly |
| Long rotation periods | Extended exposure window | Rotate more frequently |
| No expiration enforcement | Stale secrets persist | Set hard expiration dates |

---

*Guide from IDPF-Security Framework*

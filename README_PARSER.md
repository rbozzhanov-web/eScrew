# AIMS eCrew Parser

Production-grade middleware for integrating Air Astana's AIMS eCrew scheduling system with your application.

## Architecture

```
Your Application → Parser API (FastAPI) → AIMS eCrew
                       ↓
                   Redis Cache
                   (Session storage)
```

## Features

- ✅ **Secure Authentication**: CSRF token handling, session caching with Redis
- ✅ **Schedule Parsing**: Extract flights, times, crew information from AIMS
- ✅ **Error Handling**: Automatic retry with exponential backoff, rate limiting
- ✅ **Session Caching**: 25-minute TTL sessions in Redis to reduce auth calls
- ✅ **Browser Automation**: Selenium support for JavaScript-rendered content
- ✅ **Security**: Credential storage via AWS Secrets Manager or Vault
- ✅ **Logging**: Sanitized logs (passwords/tokens redacted automatically)
- ✅ **Async Support**: Background tasks via Celery
- ✅ **API Docs**: Auto-generated OpenAPI/Swagger documentation

## Quick Start

### 1. Clone and Setup

```bash
git clone https://github.com/rbozzhanov-web/eScrew.git
cd eScrew
cp .env.example .env
```

### 2. Configure Credentials

Edit `.env`:
```bash
AIMS_USERNAME=your_air_astana_username
AIMS_PASSWORD=your_air_astana_password
REDIS_URL=redis://localhost:6379
```

### 3. Run with Docker Compose

```bash
docker-compose up -d
```

Services:
- **Parser API**: http://localhost:8000
- **API Docs**: http://localhost:8000/api/docs
- **Redis**: localhost:6379

### 4. Test Authentication

```bash
curl -X POST http://localhost:8000/api/auth/test \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password"
  }'
```

### 5. Fetch Schedule

```bash
curl -X POST http://localhost:8000/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password",
    "start_date": "2026-09-03",
    "end_date": "2026-09-10"
  }'
```

## API Endpoints

### Health Check
```
GET /health
```

### Authentication Test
```
POST /api/auth/test
```

### Get Schedule
```
POST /api/schedule
```

**Request:**
```json
{
  "username": "string",
  "password": "string",
  "start_date": "2026-09-03",
  "end_date": "2026-09-10",
  "crew_id": "optional",
  "use_cache": true
}
```

**Response:**
```json
{
  "status": "success",
  "flights": [
    {
      "flight_id": "AE123",
      "flight_number": "AE123",
      "date": "2026-09-03",
      "departure_time": "14:30",
      "arrival_time": "16:45",
      "departure_airport": "ALA",
      "arrival_airport": "NUR",
      "aircraft_type": "A320",
      "registration": "P4-AAA",
      "crew": [
        {
          "name": "John Doe",
          "position": "Captain",
          "id": null
        }
      ]
    }
  ],
  "last_update": "2026-09-03T10:30:00Z",
  "session_valid_until": "2026-09-03T14:30:00Z"
}
```

### Async Sync
```
POST /api/schedule/sync
```

Returns task ID for polling.

### Session Management
```
GET /api/status/session?username=user
POST /api/cache/clear?username=user
```

## Project Structure

```
.
├── src/
│   ├── auth/
│   │   └── authenticator.py      # CSRF + session handling
│   ├── parser/
│   │   ├── fetcher.py            # HTTP client with retry logic
│   │   ├── html_parser.py         # BeautifulSoup parsing
│   │   └── selenium_browser.py    # Selenium for JS content
│   ├── api/
│   │   ├── routes.py             # FastAPI endpoints
│   │   └── schemas.py            # Pydantic models
│   ├── utils/
│   │   └── logger.py             # Sanitized logging
│   ├── tests/
│   │   └── test_parser.py        # Unit tests
│   ├── config.py                 # Configuration
│   └── main.py                   # FastAPI app
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
└── .env.example
```

## Configuration

All settings in `src/config.py`. Override via environment variables:

```bash
AIMS_BASE_URL=https://aims.airastana.com
AIMS_USERNAME=user
AIMS_PASSWORD=pass
REDIS_URL=redis://localhost:6379
LOG_LEVEL=INFO
REQUEST_TIMEOUT=30
MAX_RETRIES=3
BROWSER_HEADLESS=true
DEBUG=false
```

## Security Best Practices

### Credential Storage

**Development:**
```bash
# Use .env file (git-ignored)
AIMS_USERNAME=dev_user
AIMS_PASSWORD=dev_pass
```

**Production:**
```python
# AWS Secrets Manager
import boto3
client = boto3.client('secretsmanager')
secret = client.get_secret_value(SecretId='aims-ecrew-creds')
```

### Logging
- Passwords, tokens, emails automatically redacted
- All logs sent to CloudWatch/Datadog (not local files)
- Audit trail for all authentication attempts

### HTTPS
- Only HTTPS connections to AIMS
- Certificate verification enabled by default
- TLS 1.2+ required

## Testing

```bash
# Install test dependencies
pip install -r requirements.txt

# Run unit tests
pytest src/tests/

# With coverage
pytest src/tests/ --cov=src --cov-report=html
```

## Monitoring

Key metrics to track:
- Authentication success/failure rate
- Schedule fetch latency (p50, p95, p99)
- Parse errors (4xx/5xx from AIMS)
- Cache hit rate (Redis)
- Session reuse efficiency

Send to CloudWatch:
```python
import cloudwatch
cloudwatch.put_metric_data(
    Namespace='AIMS-Parser',
    MetricData=[
        {
            'MetricName': 'ScheduleFetchLatency',
            'Value': latency_ms,
            'Unit': 'Milliseconds'
        }
    ]
)
```

## Troubleshooting

### 401 Unauthorized
- Credentials expired
- Account locked (2FA)
- Solution: Clear cache, re-authenticate

### 429 Rate Limit
- Too many requests per minute
- Solution: Increase `RATE_LIMIT_DELAY`, reduce `RATE_LIMIT_MAX_PER_MINUTE`

### CSRF Token Not Found
- HTML structure changed
- Solution: Update selectors in `html_parser.py`

### Browser Timeout (Selenium)
- JavaScript slow to render
- Solution: Increase `BROWSER_TIMEOUT` in `.env`

## Development

### Local development (no Docker):

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start Redis separately
redis-server

# Run FastAPI
python -m uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
```

### Debug logging:
```bash
LOG_LEVEL=DEBUG python -m uvicorn src.main:app
```

## Production Deployment

### Docker image build:
```bash
docker build -t aims-parser:1.0.0 .
docker tag aims-parser:1.0.0 your-registry/aims-parser:1.0.0
docker push your-registry/aims-parser:1.0.0
```

### AWS ECS:
```bash
# Create task definition
aws ecs register-task-definition --cli-input-json file://task-definition.json

# Create service
aws ecs create-service \
  --cluster production \
  --service-name aims-parser \
  --task-definition aims-parser:1
```

### Kubernetes:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: aims-parser
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: parser
        image: your-registry/aims-parser:1.0.0
        ports:
        - containerPort: 8000
        env:
        - name: AIMS_USERNAME
          valueFrom:
            secretKeyRef:
              name: aims-secrets
              key: username
```

## Contributing

1. Create feature branch: `git checkout -b feature/parser-v2`
2. Make changes
3. Run tests: `pytest src/tests/`
4. Commit: `git commit -m "Add feature"`
5. Push: `git push origin feature/parser-v2`
6. Create Pull Request

## License

Internal use only - Air Astana integration.

## Support

- **Documentation**: See `docs/aims-parser/TECHNICAL_SPEC.html`
- **Issues**: GitHub Issues
- **Slack**: #aviation-integrations

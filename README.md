# Project 2: Instrumented & Monitored Cloud Service

*Order API — Logs, Metrics, Alerts, and a Real Incident, End to End*

## Overview

A small order-processing REST API, deployed on EC2, fully instrumented for observability: structured logging, custom metrics, a monitoring dashboard, tiered alerting, and a real diagnosed incident.

Built as Project 2 for Ironhack's Cloud/DevOps Engineering bootcamp, extending the logging setup from an earlier lab into a complete observability stack.

## Architecture

The Order API (Express + Winston, running on EC2) produces two independent streams of observability data: structured logs (shipped by the CloudWatch Agent) and custom metrics (published directly via the AWS SDK). Both land in CloudWatch, which feeds a dashboard and a tiered alarm system that escalates to email via SNS.

See `ARCHITECTURE.md` for the full diagram and component breakdown.

## What's included

| Requirement | Status |
|---|---|
| Structured JSON logging with correlation IDs | ✅ |
| 5 custom CloudWatch metrics (business + technical) | ✅ |
| CloudWatch dashboard with Golden Signals | ✅ (8 widgets) |
| Tiered CloudWatch alarms + SNS email alerting | ✅ (3 alarms + 1 composite) |
| Incident response simulation (injected failure, diagnosed) | ✅ |
| Metric filters deriving metrics from logs | ✅ (Should Have) |
| Composite alarm | ✅ (Should Have) |
| Auto-remediation Lambda (enriched alerting) | ✅ (Should/Nice to Have) |

## How to run it

The application runs on an EC2 instance (`i-054afc2f410be3eee`, eu-west-3) as a systemd service (`order-api.service`), auto-starting on boot.

```bash
cd app/
npm install
npm start
```

Requires an IAM role/credentials with `cloudwatch:PutMetricData` permission to publish custom metrics.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` | Basic hello-world / liveness check |
| GET | `/health` | Health check endpoint |
| POST | `/orders` | Create an order (requires `amount`, `user_id`; optional `items`) |
| GET | `/orders/:id` | Retrieve an order by ID |
| GET | `/error` | Deliberately triggers a 500 error (for testing alerting) |

## Documentation

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — system architecture and component breakdown
- [`INSTRUMENTATION.md`](./INSTRUMENTATION.md) — logging and metrics strategy
- [`MONITORING.md`](./MONITORING.md) — dashboard design and widget explanations
- [`ALERTING.md`](./ALERTING.md) — alarm strategy, thresholds, and response procedures
- [`INCIDENTS.md`](./INCIDENTS.md) — the injected CPU-saturation incident, diagnosis, and proposed fixes

Presentation slides are submitted separately (not included in this repository).

## Screenshots

See the `evidence/` folder for dashboard, alarm, and incident screenshots referenced throughout the documentation above.

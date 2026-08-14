# Architecture

## Overview

The Order API is a small Express.js REST service running on a single EC2 instance, instrumented end-to-end for observability. It produces two independent streams of telemetry — structured logs and custom metrics — both of which land in Amazon CloudWatch and power a monitoring dashboard and a tiered alerting system.

## Diagram

See `evidence/architecture-diagram.png` (exported from draw.io) for the full visual.

**Flow summary:**

```
Order API (EC2)
  ├─ Structured logs (Winston, JSON) → CloudWatch Agent → CloudWatch Logs
  └─ Custom metrics → AWS SDK (PutMetricData) → CloudWatch Metrics
                                                        │
                                                        ▼
                                        CloudWatch (Logs + Metrics)
                                          │                    │
                                          ▼                    ▼
                                CloudWatch Dashboard      CloudWatch Alarms
                                (Golden Signals view)     (Warning + Critical tiers)
                                                                │
                                                                ▼
                                                          SNS Topic
                                                        (order-api-alerts)
                                                          │        │
                                                          ▼        ▼
                                                  Email          Lambda
                                                (standard)   (order-api-alert-enricher)
                                                                    │
                                                                    ▼
                                                          SNS Topic (enriched)
                                                                    │
                                                                    ▼
                                                              Email (enriched,
                                                            with recent error logs)
```

## Components

| Component | Purpose |
|---|---|
| **EC2 instance** (`i-054afc2f410be3eee`, eu-west-3, t3.micro, Ubuntu) | Hosts the Order API |
| **Express app** (`server.js`) | Handles HTTP requests: create/retrieve orders, health check, deliberate error endpoint |
| **Winston** | Structured JSON logging library, writes to `application.log` |
| **CloudWatch Agent** | Runs as a systemd service on the instance, tails `application.log`, ships lines to CloudWatch Logs (`/ce-lab/app-logging`) |
| **AWS SDK (`@aws-sdk/client-cloudwatch`)** | Publishes 5 custom metrics directly from app code via `PutMetricData` |
| **CloudWatch Logs** | Stores structured log lines; two metric filters derive additional metrics from log content |
| **CloudWatch Metrics** | Stores all published and derived metrics |
| **CloudWatch Dashboard** (`order-api-golden-signals`) | Visualizes Golden Signals + business metrics, 6 widgets |
| **CloudWatch Alarms** | 3 metric alarms (warning + 2 critical tiers) + 1 composite alarm |
| **SNS Topic** (`order-api-alerts`) | Receives alarm state-change notifications, fans out to email and Lambda |
| **Lambda** (`order-api-alert-enricher`) | Queries recent error logs via Logs Insights, publishes an enriched notification |
| **SNS Topic** (`order-api-alerts-enriched`) | Delivers the Lambda's enriched notification via email |
| **systemd** | Manages both the Order API and the CloudWatch Agent as auto-starting, auto-restarting services |

## Why two independent telemetry paths

Logs and metrics answer different questions and are optimized differently:

- **Logs** are for investigation — full event detail, correlation IDs, human-readable context. Read *after* something is flagged, to find out why.
- **Metrics** are for trend detection and alerting — numeric, cheap to evaluate continuously, power dashboards and alarms in near real time.

The app produces both independently for the same events, rather than deriving one from the other exclusively — this also provides redundancy (see the metric filters in `INSTRUMENTATION.md`, which derive metrics from logs as a secondary path to the SDK-published ones).

## Reliability notes

Both the Order API and the CloudWatch Agent run as systemd services (`order-api.service`, `amazon-cloudwatch-agent.service`), configured to auto-start on instance boot and auto-restart on failure — verified working after a full instance stop/start cycle. The instance is stopped between working sessions to conserve AWS credits; the public IP changes on each restart.

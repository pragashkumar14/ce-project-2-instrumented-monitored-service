# Alerting

## Alarms

| Alarm | Metric | Threshold | Tier |
|---|---|---|---|
| `order-api-error-rate-warning` | `ErrorRate` (Sum, 5 min) | > 2 | Warning |
| `order-api-error-rate-critical` | `ErrorRate` (Sum, 5 min) | > 5 | Critical |
| `order-api-latency-p95-critical` | `ApiLatencyMs` (p95, 5 min) | > 1000ms | Critical |
| `order-api-service-critical` | Composite: `error-rate-critical` OR `latency-p95-critical` | — | Critical (composite) |

## Threshold rationale

- **Error rate warning (>2/5min):** an early "keep watching" signal, low enough to catch a developing problem before it's severe.
- **Error rate critical (>5/5min):** a clearly serious spike, distinct from the warning tier by a meaningful margin to avoid the two firing back-to-back for the same minor blip.
- **Latency p95 critical (>1000ms):** taken directly from the project brief's own example project outline ("Critical: P95 latency > 1 second"), not an arbitrary number.
- Each alarm's **description** doubles as its documented rationale and becomes the first line of the resulting email — whoever is notified knows immediately what happened and what to check first (e.g. "check CloudWatch Logs Insights, filter level=ERROR").

## Composite alarm

`order-api-service-critical` combines the two critical-tier alarms with OR logic: it fires if *either* error rate or latency crosses its critical threshold. This gives a single "is the service critically unhealthy" signal, reducing the need to mentally correlate two separate alarms during a real incident, while the individual alarms remain available for root-cause detail.

**Note on notification routing:** in a real multi-person team, individual alarms would typically route to the on-call engineer/team channel (detailed, technical), while the composite alarm would route to a team lead or broader escalation list (a single health signal, no metric-level detail needed). For this solo project, all alarms point to the same SNS topic and inbox — this is a routing simplification for a one-person team, not redundant alerting design.

## Notification pipeline

1. Alarm state changes (OK → ALARM) → publishes to SNS topic `order-api-alerts`
2. That topic has two subscribers:
   - **Email** — the standard CloudWatch alarm notification
   - **Lambda** (`order-api-alert-enricher`) — see below

### Auto-remediation: enriched alerting (Should/Nice to Have)

Rather than automating a *fix* (e.g. blindly restarting the service), the Lambda automates *diagnosis*: it queries CloudWatch Logs Insights for the 5 most recent error-level log lines from the last 10 minutes and publishes a richer notification — combining the alarm's details with real log content and correlation IDs — to a separate SNS topic, `order-api-alerts-enriched`.

**Why diagnosis over auto-remediation-by-restart:** blind auto-restart risks masking recurring issues and can cause unnecessary downtime for problems that aren't actually crash-worthy. Automating the manual log-digging a human would otherwise do first is safer and still meaningfully cuts response time.

**Why a separate SNS topic:** the Lambda is triggered by `order-api-alerts`; if it published back to that same topic, it would trigger itself repeatedly in a feedback loop.

**IAM scope:** the Lambda's execution role is limited to `logs:StartQuery` / `GetQueryResults` / `StopQuery` and `sns:Publish` to only the enriched topic's ARN — least-privilege, not broad account access.

**Confirmed working:** tested end to end by triggering a real error burst and letting the alarm transition from OK to ALARM. Both the standard alarm email and the enriched Lambda email arrived within the expected window; the enriched email contained 4 real error log lines with correlation IDs, pulled live from Logs Insights. See `evidence/evidence-lambda-enriched-alert-email.png`.

## Important alarm behavior (learned during testing)

CloudWatch alarms notify only on a **state change** (OK → ALARM or ALARM → OK), not on every evaluation period where the condition remains true. Sending additional test errors while an alarm is already in ALARM state does not re-trigger a new notification — the alarm must first return to OK (no violations in a subsequent period) before it can fire again. This is standard CloudWatch behavior, confirmed while testing the Lambda integration.

## Response procedures

| Alarm fires | First step |
|---|---|
| Error rate warning | Check Logs Insights, filter `level = "error"`, look for a pattern (recent deploy, specific endpoint) |
| Error rate critical | Same as above, treat as urgent — check for a bad deploy, consider rollback |
| Latency p95 critical | Check the dashboard's CPU/Memory widgets first — is saturation the cause? Then check Logs Insights for slow-running requests by correlation ID |
| Service critical (composite) | Check which underlying alarm fired (error-rate-critical or latency-p95-critical) via the CloudWatch console, then follow that alarm's procedure above |

Full evidence of a live-tested alarm (state change, email received, dashboard graph) is in the `evidence/` folder and referenced in `INCIDENTS.md`.

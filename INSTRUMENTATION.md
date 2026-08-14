# Instrumentation

Covers the two Must Have categories that make observability data exist in the first place: structured logging and custom metrics.

## Logging strategy

The Order API uses Winston, configured with JSON formatting and timestamps, writing to both the console and `application.log` (which the CloudWatch Agent tails and ships to the `/ce-lab/app-logging` log group).

**Log levels used deliberately:**
- `info` — normal operation: `request_received`, `health_check`, `order_created`, `order_retrieved`
- `warn` — recoverable, expected issues: `order_validation_failed` (missing required fields), `order_not_found` (404 on retrieval)
- `error` — genuine failures: `error_occurred` (the deliberate `/error` endpoint), `metric_publish_failed` (if a CloudWatch metric call fails)

**Correlation IDs:** every request generates or forwards a `correlation_id` (via the `x-correlation-id` header, or a fresh UUID if absent), attached to every log line produced while handling that request. This allows tracing a single request's full story through the logs, rather than piecing together unrelated lines.

**Example log line:**
```json
{
  "level": "info",
  "message": "order_created",
  "correlation_id": "1fa0bc4b-76dd-4120-88...",
  "order_id": "ord-404c650e",
  "amount": 59.99,
  "items": 3,
  "user_id": "user-88",
  "timestamp": "2026-08-12T16:13:35.161Z"
}
```

## Custom metrics strategy

Five metrics are published directly from application code via the AWS SDK (`@aws-sdk/client-cloudwatch`), under the `OrderAPI` namespace:

| Metric | Type | Statistic used | What it measures |
|---|---|---|---|
| `OrdersCreated` | Business | Sum | Successful order creations |
| `OrderValue` | Business | Average | Typical order size in currency |
| `OrdersFailedValidation` | Business | Sum | Orders rejected for missing required fields |
| `ApiLatencyMs` | Technical | p95 | Request duration, captured automatically via middleware on every request |
| `ErrorRate` | Technical | Sum | Genuine server errors |

**Design notes:**
- `ApiLatencyMs` is captured by an Express middleware wrapping every request, not manually added per route — new endpoints get latency tracking automatically, no risk of forgetting it.
- Metrics are batched where possible in a single `PutMetricData` call rather than one call per metric, to reduce API call volume.
- A small `putMetric()` helper wraps the SDK call with try/catch, logging (`metric_publish_failed`, at `error` level) rather than crashing the request if a metric publish fails — observability code should never take down the feature it's observing.

## Derived metrics from logs (Should Have)

Two CloudWatch metric filters on the `/ce-lab/app-logging` log group provide a second, independent measurement path for errors, derived purely from log content:

| Filter name | Pattern | Metric | Namespace |
|---|---|---|---|
| `error-log-count` | `{ $.level = "error" }` | `ErrorLogCount` | `OrderAPI-LogDerived` |
| `warn-log-count` | `{ $.level = "warn" }` | `WarnLogCount` | `OrderAPI-LogDerived` |

This is deliberate redundancy: `ErrorRate` (SDK-published) and `ErrorLogCount` (log-derived) measure the same underlying event through two independent mechanisms. If they ever disagreed, that mismatch would itself be diagnostically useful — for example, if the app crashed before it could call `PutMetricData` but still managed to write a log line first.

## IAM permissions required

The EC2 instance role (`ce-lab-logging-role-pk14`) has the AWS-managed `CloudWatchAgentServerPolicy` attached, which includes `cloudwatch:PutMetricData` — no additional permissions were needed for metric publishing, verified before writing any metrics code.

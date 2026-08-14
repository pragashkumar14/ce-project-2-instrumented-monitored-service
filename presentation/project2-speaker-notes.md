# Project 2 — presentation speaker notes

## Title slide

**Project 2: Instrumented & Monitored Cloud Service**
*Order API — Logs, Metrics, Alerts, and a Real Incident, End to End*

**Dashboard name:** `order-api-golden-signals` (CloudWatch dashboard)

## Architecture & instrumentation (slide: architecture diagram)

The Order API splits into two paths — the CloudWatch agent, which tails the log file, and the SDK's PutMetricData, called directly from the app code. Both converge into CloudWatch, which then splits again into a dashboard and alarms, with alarms escalating through an SNS topic to email.

**Talking points to expand on when presenting:**
- Order API (EC2): Express app instrumented with Winston for structured JSON logging
- Two separate mechanisms feed CloudWatch — logs go through the agent (file-based), metrics go direct via SDK (API-based). Worth stating explicitly why: logs are for investigation, metrics are for trend/alerting.
- CloudWatch dashboard: Golden Signals view — request rate, error rate, latency (p95), saturation (CPU/memory)
- CloudWatch alarms: tiered warning + critical thresholds, watching the same metrics
- SNS topic: routes alarm state changes to email notification

---

## Instrumentation (slide: structured logging + custom metrics)

The Order API runs on the EC2 instance from Lab M6.01, extended with a full order lifecycle: create, retrieve, validate, and error paths, each instrumented with structured logging and custom metrics.

**Talking points to expand on when presenting:**
- Structured logging: every request produces a JSON log line via Winston, with a correlation ID, appropriate level (info / warn / error), and contextual fields (order ID, user ID, amount)
- Log levels used deliberately: info for normal flow (order created, retrieved), warn for recoverable issues (missing required fields, order not found), error for failures (the /error endpoint)
- Custom metrics: 5 metrics published directly from app code via the AWS SDK — OrdersCreated, OrderValue, ApiLatencyMs, OrdersFailedValidation, ErrorRate
- ApiLatencyMs is captured automatically via middleware on every request, not hand-added per route
- Verified end to end: metrics visible in `aws cloudwatch list-metrics --namespace OrderAPI`, logs visible and correctly structured in application.log
- Mix of business metrics (OrdersCreated, OrderValue) and technical metrics (ApiLatencyMs, ErrorRate, OrdersFailedValidation), per the project's requirement to not just track technical stats

**Troubleshooting note worth mentioning if asked about challenges:** lost SSH access to the instance due to a corrupted .pem key file, recovered using EC2 Instance Connect with a freshly generated keypair pushed via the AWS CLI — also discovered the instance uses `ubuntu` as its SSH user rather than `ec2-user`.

---

## Monitoring dashboard (slide: live dashboard demo)

The `order-api-golden-signals` CloudWatch dashboard covers all four Golden Signals plus a business metric, in 6 widgets, laid out top to bottom by investigation priority — symptom first, cause last.

**Talking points to expand on when presenting:**
- Row 1 (traffic + errors, side by side): Request Rate (OrdersCreated, summed) and Error Rate (ErrorRate + OrdersFailedValidation, summed) — the two things checked first in any incident, paired so you can correlate "did errors spike relative to traffic"
- Row 2: API Latency shown as p95, not average — a deliberate choice, since averages can hide a slow tail affecting a subset of users
- Row 3: CPU Utilization and Memory Utilization — saturation signals, often the root cause behind rising latency/errors
- Also added: Average Order Value, a business-health signal alongside the technical ones, showing observability isn't just about uptime
- Layout follows the same "less is more" principle applied in the Module 6 dashboard redesign (48 widgets → 8): 6 widgets total, each with a clear single purpose, no vanity metrics, within the project's 6-10 widget guideline
- CPU/Memory metrics come from two different sources worth mentioning if asked: CPUUtilization is a built-in EC2 metric, while mem_used_percent is published by the CloudWatch Agent (EC2 doesn't report memory natively)

---

## Alerting (slide: alarms + email demo)

Three CloudWatch alarms cover two tiers on the metric most likely to signal a real problem (error rate), plus one critical alarm on latency, all routed through a single SNS topic to email.

**Talking points to expand on when presenting:**
- order-api-error-rate-warning: ErrorRate > 2 in 5 minutes — an early "keep watching" signal
- order-api-error-rate-critical: ErrorRate > 5 in 5 minutes — clear problem, immediate attention
- order-api-latency-p95-critical: p95 latency > 1000ms in 5 minutes — threshold taken directly from the project brief's own example ("Critical: P95 latency > 1 second"), so it's not an arbitrary number
- Each alarm's description doubles as its documented threshold rationale AND the first line of the email notification — whoever gets paged knows immediately what happened and what to check first (e.g. "check Logs Insights, filter level=ERROR")
- Tested live: sent 4 requests to /error, warning alarm correctly transitioned INSUFFICIENT_DATA → ALARM within ~5 minutes, email arrived with full detail (threshold crossed 4.0 > 2.0, exact timestamp, alarm ARN) — this is real evidence, not just configuration screenshots

---

## Incident response (slide: injected failure + diagnosis)

A CPU stress test was run deliberately against the EC2 instance while the Order API was under synthetic traffic, simulating a runaway process competing for CPU.

**Talking points to expand on when presenting:**
- Used stress-ng (--cpu 2 --cpu-load 100) to saturate both vCPUs on the t3.micro for ~3 minutes, timestamped precisely (13:15:21–13:18:21 UTC) alongside a concurrent traffic loop
- Diagnosed using the CloudWatch dashboard: CPU Utilization climbed from ~0.9% baseline to a peak of 60.5%, API Latency (p95) rose in step from ~1ms to 3.1ms (~3x)
- Key finding: the API degraded gracefully rather than failing — zero errors, zero failed health checks throughout, confirmed by grepping application.log for the exact test window
- No alarm fired during this incident — a deliberate finding, not an oversight: current alarms cover error rate and latency, but there's no CPU-specific alarm, so a longer/more severe CPU event would only be caught indirectly via its effect on latency
- Proposed fixes: add a dedicated CPU utilization alarm (warning >70%, critical >85%), consider a composite alarm combining CPU + latency to reduce false positives, and reconsider instance type if sustained CPU load becomes a real production pattern (t3.micro is burstable, relies on CPU credits)
- Full write-up lives in INCIDENTS.md, evidence screenshot shows CPU and latency rising/falling in lockstep against the recorded test timestamps

---

## Metric filters from logs (mention briefly if asked, or in Should Have discussion)

Beyond the 5 SDK-published metrics, two CloudWatch metric filters were added on the `/ce-lab/app-logging` log group, deriving metrics directly from log content rather than app code explicitly publishing them.

**Talking points to expand on when presenting:**
- error-log-count: filter pattern `{ $.level = "error" }`, publishes ErrorLogCount to a separate OrderAPI-LogDerived namespace
- warn-log-count: same pattern, `{ $.level = "warn" }`, publishes WarnLogCount
- Deliberate design point: this gives two independent measurement paths for the same signal — ErrorRate is published directly from app code via the SDK, while ErrorLogCount is derived purely from log content. If the two ever disagreed, that mismatch itself would be diagnostically useful (e.g. app crashed before it could call PutMetricData, but still managed to log the error)
- Not currently added to the dashboard as a widget — kept the dashboard at 6 widgets per the "less is more" principle, but documented here and in MONITORING.md as available instrumentation

---

## Composite alarm (Should Have, mention alongside alerting)

A composite alarm, order-api-service-critical, was added on top of the three individual alarms — it fires whenever EITHER order-api-error-rate-critical OR order-api-latency-p95-critical is in ALARM state.

**Talking points to expand on when presenting:**
- Rationale: a single "is the service critically unhealthy" signal is easier to act on than three separate emails for related conditions — reduces alert fatigue while still preserving the individual alarms for root-cause detail
- The composite alarm's own description points back to the individual alarms, so whoever's paged can immediately drill into which specific condition triggered it
- This mirrors how production on-call setups are often structured: broad "page me now" alarms backed by narrower diagnostic alarms underneath

---

## Auto-remediation Lambda (Should/Nice to Have — automated diagnosis, not automated fixing)

A Lambda function, order-api-alert-enricher, subscribes to the same SNS topic as the alarms. When triggered, it queries CloudWatch Logs Insights for the 5 most recent error-level log lines from the last 10 minutes, and publishes a richer notification — alarm details plus real log lines and correlation IDs — to a separate topic (order-api-alerts-enriched).

**Talking points to expand on when presenting:**
- Deliberate design choice: automates the *diagnosis*, not the *fix*. Considered auto-restarting the service via SSM, but decided that's risky for a first pass — blind auto-restart can mask recurring issues and cause unnecessary downtime for problems that aren't actually crash-worthy. Automating "gather the context a human needs" is safer and still cuts response time significantly.
- Uses a separate SNS topic (not the original order-api-alerts) specifically to avoid a feedback loop — if it published back to the topic it's subscribed to, it would trigger itself repeatedly.
- IAM role scoped narrowly: only logs:StartQuery/GetQueryResults/StopQuery and sns:Publish to the one enriched topic — least-privilege, not broad access.
- Learned during testing: CloudWatch alarms only notify on a *state change* (OK→ALARM or ALARM→OK), not on every evaluation where the condition remains true — sending more test errors while already in ALARM doesn't re-trigger anything until the alarm resets to OK first. Good real operational detail to mention if asked about alarm behavior.

**Confirmed working end to end (2026-08-13):** triggered a real error burst, alarm fired (OK→ALARM transition), both the standard email AND the enriched Lambda email arrived within the expected window. The enriched email showed 4 real error log lines with correlation IDs, pulled live via Logs Insights — proof the full chain works, not just the individual pieces. One debugging note worth mentioning if asked: the first deployment attempt had a truncated function (missing closing braces) from a copy-paste error, causing silent failures across every invocation until caught by checking the Lambda's "Failed invocations" table specifically, not just the summary duration table — a good reminder that a function "running" isn't the same as a function "succeeding."

**If asked "why so many alarms/emails for one project":**
Each one serves a genuinely different purpose, not redundant monitoring: the warning tier gives an early heads-up, the critical alarms identify exactly which metric crossed a dangerous threshold, the composite alarm gives a single "is the service healthy" signal for a team lead who doesn't need metric-level detail, and the enriched Lambda alert goes further than a standard notification — it does the diagnostic legwork (pulling real log lines) automatically. In a real multi-person team these would route to different people or channels (individual alarms to on-call, composite to a lead); on a solo project they all point to the same inbox, which is a routing choice, not redundant design.

---

*(More sections — learnings — will be added here as each phase is completed.)*

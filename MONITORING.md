# Monitoring

## Dashboard

**Name:** `order-api-golden-signals`

Built around the Golden Signals framework (request rate, error rate, latency, saturation), plus one business metric, laid out with deliberate visual hierarchy — the things checked first in an incident sit at the top, root-cause signals sit below.

## Widget layout and rationale

| Row | Widgets | Why grouped this way |
|---|---|---|
| 1 | Request Rate (`OrdersCreated`, Sum) + Error Rate (`ErrorRate` + `OrdersFailedValidation`, Sum) | The two things checked first in any incident — side by side so error rate can be read relative to traffic volume, not in isolation |
| 2 | API Latency (`ApiLatencyMs`, **p95** — deliberately not average) | p95 exposes a slow tail affecting a subset of users that an average would hide |
| 3 | CPU Utilization (Average) + Memory Utilization (Average) | Saturation signals — often the root cause behind rising latency or errors, placed below the symptoms they explain |
| 4 | Average Order Value (`OrderValue`, Average) | A business-health signal alongside the technical ones — observability isn't just uptime |

6 core metric widgets, organized under labeled sections, plus two live-diagnostic widgets, following the "less is more" principle applied consistently across this project (the same discipline used in an earlier Module 6 dashboard redesign that cut 48 widgets down to 8).

## Section headers

The dashboard is organized into three labeled sections (added as Text/Markdown widgets) for easier navigation, especially during a live demo:
- **Golden Signals — Traffic & Errors**
- **Latency & Saturation**
- **Business Metrics**
- **Live Diagnostics** (see below)

## Why p95, not average, for latency

An average can look fine even when a meaningful fraction of requests are slow — e.g. if 95 requests take 50ms and 5 take 5000ms, the average (~300ms) hides that 5% of users are having a much worse experience. p95 surfaces that directly.

## Why CPU and memory come from different sources

`CPUUtilization` is a built-in EC2 metric (AWS namespace). `mem_used_percent` is published by the CloudWatch Agent under the `CWAgent` namespace, since EC2 doesn't report memory utilization natively — it requires an agent running on the instance to collect it.

## What's deliberately not on the dashboard

The two log-derived metrics (`ErrorLogCount`, `WarnLogCount` — see `INSTRUMENTATION.md`) are not shown as dashboard widgets. They exist as background instrumentation and a cross-check against the SDK-published `ErrorRate`, but adding them as near-duplicate line charts would add visual clutter without adding new information to the dashboard itself.

## Live Diagnostics section (added after initial build, inspired by a class example)

Two additional widgets, grouped separately from the trend-based Golden Signals widgets above since they serve a different purpose — current state and raw investigative detail, rather than trends over time:

- **CPU Utilization (Live)** — a gauge widget (not a line chart) showing the current CPU value at a glance, with color-coded threshold bands: green below 70%, yellow 70-85%, red above 85%. Complements the existing CPU line chart, which shows trend; the gauge shows "right now."
- **Recent Errors (Logs Insights)** — a Logs table widget embedded directly on the dashboard, running `filter level = "error" | sort @timestamp desc | limit 10` against the log group. Satisfies the "correlation analysis in dashboard" Should Have item — during an incident, recent error detail (including correlation IDs) is visible without leaving the dashboard to run a separate query.

This brings the total to 8 widgets, still within the project's recommended 6-10 range.

## How to use this dashboard during an incident

1. Check **Request Rate + Error Rate** first — is traffic normal, and is the error rate elevated relative to it?
2. Check **API Latency (p95)** — are requests slow, not just erroring?
3. Check **CPU/Memory** — is resource saturation the likely cause?
4. Check **Average Order Value** if a business-impact question comes up (e.g. "are we still processing real revenue during this incident?")

This top-down flow (symptom → cause) is the same pattern used to diagnose the CPU-saturation incident documented in `INCIDENTS.md`.

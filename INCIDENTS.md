# Incident Summary — CPU Saturation Under Load

## Overview

| | |
|---|---|
| **Date** | 2026-08-13 |
| **Duration** | ~3 minutes (13:15:21 – 13:18:21 UTC) |
| **Severity** | Low — no errors, no downtime, degraded performance only |
| **Detected via** | CloudWatch dashboard (CPU Utilization, API Latency widgets) |
| **Service impact** | API remained fully available throughout; p95 latency increased ~3x |

## Timeline (UTC)

| Time | Event |
|---|---|
| 13:13:05 | Synthetic order traffic started (1 request/sec, `POST /orders`) |
| 13:15:21 | CPU stress test started (`stress-ng --cpu 2 --cpu-load 100`), simulating a runaway process consuming both vCPUs on the `t3.micro` instance |
| ~13:15:21 – 13:18 | CPU Utilization climbed from a baseline of ~0.9% to a peak of **60.5%** |
| ~13:15 – 13:20 | API Latency (p95) rose from a baseline of ~1ms to a peak of **3.1ms** (~3x increase), tracking the CPU climb closely |
| 13:18:12 | Synthetic order traffic stopped |
| 13:18:21 | CPU stress test completed |
| ~13:20 | CPU and latency both recovered to baseline |

## Detection

The CPU spike and corresponding latency increase were identified using the `order-api-golden-signals` CloudWatch dashboard, cross-referencing the **CPU Utilization** and **API Latency (p95)** widgets against known test start/end timestamps recorded in the terminal during the test. No CloudWatch alarm fired during this incident, since CPU/latency thresholds were not configured to alert at this severity (see Proposed Fixes).

## Root Cause

A synthetic CPU stress test (`stress-ng`, 2 workers at 100% load on a 2-vCPU `t3.micro` instance) was run deliberately to simulate a runaway process or "noisy neighbor" scenario competing for CPU with the Order API. This is a controlled, injected failure for the purposes of this project's incident response exercise — not a spontaneous production issue.

## Evidence

- Dashboard screenshot showing CPU Utilization and API Latency (p95) both rising and falling in the 15:10–15:27 (local time) / 13:10–13:27 (UTC) window, aligned to the recorded test timestamps — see `evidence-incident-cpu-stress-dashboard.png`
- Application logs (`application.log`) for the test window show **zero errors and zero failed validations** — every one of the ~300 synthetic orders during the test period returned `order_created` at `level: info`
- `stress-ng --metrics-brief` output confirmed the stressor ran successfully at full intensity: 374,991 bogo ops over 240s of real time, with 478.25s of combined user CPU time — confirming both vCPUs were saturated

## Findings

1. **The API degraded gracefully rather than failing.** Despite CPU utilization reaching 60.5% (from a near-idle baseline), no requests errored, no health checks failed, and the service remained fully available throughout.
2. **Latency impact was real but modest.** p95 latency roughly tripled (1ms → 3.1ms) during peak CPU load — noticeable in absolute terms, but not severe enough to breach the existing `order-api-latency-p95-critical` alarm (threshold: 1000ms), since baseline latency on this lightweight endpoint is very low.
3. **No alarm fired during this incident.** This is expected given current thresholds, but it highlights a gap: there is currently no alarm on CPU utilization itself, meaning a sustained CPU saturation event (e.g. a real runaway process, not a 3-minute test) would only be caught indirectly, via its effect on latency — and only once that effect crossed the 1-second threshold.
4. **Metric timing has natural lag.** CPU and latency metrics reporting/decline trailed the actual stress test end (13:18:21) by roughly 1-2 minutes, consistent with CloudWatch's metric collection period — worth accounting for when diagnosing time-sensitive incidents in production.

## Proposed Fixes

1. **Add a dedicated CPU Utilization alarm** (e.g. warning at >70%, critical at >85% sustained over 5 minutes) so CPU saturation is caught directly, rather than relying solely on its downstream effect on latency.
2. **Consider a composite alarm** combining elevated CPU with elevated latency, to reduce false positives from brief, harmless CPU spikes (e.g. deploys, cron jobs) while still catching genuine sustained saturation.
3. **For production**, evaluate moving off a burstable `t3.micro` instance type if sustained CPU load is expected, since burstable instances rely on CPU credits that deplete under continuous load — this test was short enough not to exhaust credits, but a longer real incident could behave differently once credits run out.
4. **Document this threshold gap** in `MONITORING.md` and `ALERTING.md` so future contributors understand why CPU currently has dashboard visibility but no dedicated alarm.

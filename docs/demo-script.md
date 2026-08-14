# Demo Script

`app/scripts/run-demo.sh` is the script used to generate a live, end-to-end demonstration of the whole observability stack in one run — traffic, errors, and CPU load, timed so every widget, both alarms, and the Lambda all have real data within a single ~12-minute window.

## What it injects

| Injection | Mechanism | What it lights up |
|---|---|---|
| **Traffic** | `curl` loop, 1 request/sec for ~12 min, mostly successful `POST /orders`, every 15th request deliberately missing required fields | Request Rate, Order Value, Total Orders, OrdersFailedValidation |
| **Errors** | 6 requests to `GET /error`, starting 30s in, ~2s apart | Error Rate, Recent Errors (Logs Insights), both error-rate alarms, the Lambda |
| **CPU Load** | `stress-ng --cpu 2 --cpu-load 100`, starting 15s in, running 2 minutes | CPU Utilization (line + gauge), API Latency (p95) |

Traffic and errors are just HTTP requests exercising the app's own routes — they don't stress the instance. CPU load is the only piece that actually loads the hardware, using `stress-ng`, a standalone Linux tool unrelated to the app's code, to simulate a "noisy neighbor" process competing for the same CPU.

## Why this combination

Each piece was chosen to trigger a different part of the stack, deliberately overlapping in time so a single run demonstrates the whole pipeline rather than one metric in isolation:

- The 6-error burst is calibrated to cross **both** the warning (`ErrorRate > 2/5min`) and critical (`ErrorRate > 5/5min`) thresholds in one shot, which also fires the composite alarm and triggers the Lambda enrichment
- The CPU load mirrors the exact test used in the documented incident (see `INCIDENTS.md`), so the live demo and the write-up tell the same story

## How it's run

```bash
cd /home/ubuntu/app
./scripts/run-demo.sh
```

All three injections run as backgrounded jobs (`&` + `disown`), so the script returns control to the terminal immediately — safe to switch away (e.g. back to a presentation) while it runs. Progress can be watched live with:

```bash
tail -f /home/ubuntu/app/demo.log
```

## Timed test run (2026-08-14)

A real timed run confirmed the injected load reaches the dashboard within seconds and the full pipeline (alarms + Lambda) completes within the expected 5-10 minute window:

| Elapsed | Event |
|---|---|
| 0:00 | Script started |
| 0:15 | CPU stress begins |
| 0:30 | Error burst begins (6 requests) |
| 0:43 | Error burst ends |
| 2:15 | CPU stress ends |
| ~5-10 min | Both alarms fire, Lambda-enriched email arrives |
| ~12 min | Traffic loop ends |

One observation from this run worth noting: peak CPU utilization topped out around 31-60% rather than the full 100% `stress-ng` was requesting. This is expected on a `t3.micro` — it's a burstable instance type with a CPU credit system that limits sustained high usage, and the CloudWatch EC2 CPU metric reports on a 5-minute period by default, which averages down a short 2-minute burst. Both effects understate the instantaneous load without indicating any problem with the test itself.

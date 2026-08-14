# Demo Script

`app/scripts/run-demo.sh` is the script used to generate a live, end-to-end demonstration of the whole observability stack in one run — traffic, errors, and CPU load, timed so every widget, both alarms, and the Lambda all have real data within a single ~12-minute window.

## What it injects

| Injection | Mechanism | What it lights up |
|---|---|---|
| **Traffic** | `curl` loop, 2 requests/sec for ~12 min (~1344 successful orders), mostly successful `POST /orders`, every 15th request deliberately missing required fields | Request Rate, Order Value, Total Orders, OrdersFailedValidation |
| **Errors** | 6 requests to `GET /error`, starting 30s in, ~2s apart | Error Rate, Recent Errors (Logs Insights), both error-rate alarms, the Lambda |
| **CPU Load** | `stress-ng --cpu 2 --cpu-load 100`, starting 15s in, running 6 minutes | CPU Utilization (line + gauge), API Latency (p95) |

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

## Timed test runs (2026-08-14)

**Run 1 (original, 2-min stress):** confirmed the pipeline works end to end, but CPU only peaked around 60%.

**Run 2 (6-min stress, isolated test):** peaked at a full 100%. This confirmed the root cause of Run 1's lower reading: the CloudWatch EC2 CPU metric reports on a **5-minute period** by default. A 2-minute stress burst only partially fills that window, so the period average gets diluted by the surrounding idle minutes in the same bucket. A stress duration that fully covers at least one complete 5-minute period shows the true peak instead.

**Final version (this script):** combines the fix from Run 2 (6-minute stress) with a higher traffic rate (2 req/sec instead of 1) to show more order volume within the same ~12-minute window, keeping total runtime presentation-friendly.

| Elapsed | Event |
|---|---|
| 0:00 | Script started |
| 0:15 | CPU stress begins |
| 0:30 | Error burst begins (6 requests) |
| 0:43 | Error burst ends |
| 6:15 | CPU stress ends — peaks at ~100% |
| ~5-10 min | Both alarms + composite fire, 3 standard + 3 Lambda-enriched emails (6 total) |
| ~12 min | Traffic loop ends (~1344 successful orders) |

One additional real finding from testing: firing 6 errors crosses both the warning and critical thresholds simultaneously, which also triggers the composite alarm — three distinct alarm events from one burst. Since the Lambda subscribes to the whole alerts topic, it fires once per alarm event, producing 6 emails total (3 standard + 3 enriched) from a single test run. This is expected behavior given the alarm design (see `ALERTING.md`), not a duplication bug.

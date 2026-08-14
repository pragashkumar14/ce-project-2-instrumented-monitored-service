#!/bin/bash
# run-demo.sh — paste this into the VSCode terminal (SSH'd into EC2)
# right after your intro slide. It starts everything in the background
# and returns control to you immediately, so you can switch back to
# your slides while it runs underneath.
#
# By the time you reach the "Impact & Results" slide (~10-12 min later),
# every widget will have real data, both alarms will have fired, both
# emails (standard + Lambda-enriched) should be in your inbox.

echo "=================================================="
echo "DEMO STARTED: $(date -u +'%Y-%m-%d %H:%M:%S UTC')"
echo "=================================================="

cd /home/ubuntu/app

# 1) Background traffic loop — ~12 minutes, 2 requests/sec
#    Mix of successful orders + occasional validation failures
(
  for i in $(seq 1 1440); do
    if (( i % 15 == 0 )); then
      # occasional validation failure — populates OrdersFailedValidation
      curl -s -o /dev/null -X POST http://localhost:5000/orders \
        -H "Content-Type: application/json" \
        -d '{"items": 1}'
    else
      # normal successful order — populates OrdersCreated, OrderValue, Total Orders
      curl -s -o /dev/null -X POST http://localhost:5000/orders \
        -H "Content-Type: application/json" \
        -d "{\"amount\": $((RANDOM % 200 + 10)), \"items\": $((RANDOM % 5 + 1)), \"user_id\": \"demo-user-$i\"}"
    fi
    sleep 0.5
  done
  echo "TRAFFIC LOOP END: $(date -u +'%H:%M:%S UTC')" >> /home/ubuntu/app/demo.log
) > /dev/null 2>&1 &
disown
echo "[1/3] Traffic loop started in background (~12 min, ~1344 successful orders)"

# 2) CPU stress — starts in 15s, runs for 6 minutes, spikes CPU + latency widgets.
#    6 minutes is deliberate: it fully covers at least one complete 5-minute
#    CloudWatch period, so the CPU widget shows a true peak rather than an
#    averaged-down one (confirmed via testing: a 2-min stress only showed
#    ~60% peak, a 6-min stress correctly showed 100%).
(
  sleep 15
  echo "CPU STRESS START: $(date -u +'%H:%M:%S UTC')" >> /home/ubuntu/app/demo.log
  stress-ng --cpu 2 --cpu-load 100 --timeout 360s --metrics-brief >> /home/ubuntu/app/demo.log 2>&1
  echo "CPU STRESS END: $(date -u +'%H:%M:%S UTC')" >> /home/ubuntu/app/demo.log
) > /dev/null 2>&1 &
disown
echo "[2/3] CPU stress scheduled (starts in 15s, runs 6 min — confirmed to hit ~100%)"

# 3) Error burst — starts in 30s, fires enough errors to cross BOTH the
#    warning (>2/5min) and critical (>5/5min) thresholds in one go,
#    which also triggers the Lambda enrichment email
(
  sleep 30
  echo "ERROR BURST START: $(date -u +'%H:%M:%S UTC')" >> /home/ubuntu/app/demo.log
  for i in $(seq 1 6); do
    curl -s -o /dev/null http://localhost:5000/error
    sleep 2
  done
  echo "ERROR BURST END: $(date -u +'%H:%M:%S UTC')" >> /home/ubuntu/app/demo.log
) > /dev/null 2>&1 &
disown
echo "[3/3] Error burst scheduled (starts in 30s, 6 errors — crosses warning + critical)"

echo ""
echo "All background jobs launched. Safe to switch back to your slides now."
echo "Check progress any time with: tail -f /home/ubuntu/app/demo.log"
echo ""
echo "Expected timeline from now:"
echo "  0:15  CPU stress begins"
echo "  0:30  Error burst begins (6 errors)"
echo "  6:15  CPU stress ends (should peak at ~100%)"
echo "  ~5-10 min  Warning + Critical alarms fire -> 2 standard emails"
echo "  ~5-10 min  Composite alarm fires -> 1 more standard email"
echo "  ~5-10 min  Lambda fires 3x (once per alarm) -> 3 enriched emails"
echo "  ~12 min    Traffic loop ends (~1344 successful orders)"

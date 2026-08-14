# Monday demo script — commands to run live

Run these in order, in two SSH terminals to the EC2 instance (same setup as before — check the console for current public IP first, since it changes after every stop/start).

## Before you start

1. Start the EC2 instance from the console, note the new IP
2. Reconnect via Instance Connect (adjust IP):
   ```bash
   aws ec2-instance-connect send-ssh-public-key \
     --instance-id i-054afc2f410be3eee \
     --instance-os-user ubuntu \
     --ssh-public-key file://~/.ssh/ec2-instance-connect-key.pub \
     --region eu-west-3 \
   && ssh -i ~/.ssh/ec2-instance-connect-key ubuntu@<NEW_IP>
   ```
3. Confirm both services came back up automatically:
   ```bash
   sudo systemctl status order-api
   sudo systemctl status amazon-cloudwatch-agent
   curl http://localhost:5000/health
   ```
4. Open the dashboard in a browser tab, set time range to **30 minutes**, and turn on **auto-refresh** (dropdown next to the refresh icon, top toolbar) — set it to refresh every 10-30 seconds so it updates live while you talk.

## Terminal 1 — traffic + errors + validation failures

This single script hits every widget except CPU/memory: Request Rate, Error Rate, Order Value, and (via /error and bad input) the error-tracking widgets. Run it, then narrate the architecture/dashboard while it executes in the background (~2 minutes).

```bash
cd /home/ubuntu/app
echo "DEMO TRAFFIC START: $(date -u +'%H:%M:%S UTC')"

# steady stream of successful orders — populates Request Rate + Order Value
for i in {1..60}; do
  curl -s -o /dev/null -X POST http://localhost:5000/orders \
    -H "Content-Type: application/json" \
    -d "{\"amount\": $((RANDOM % 200 + 10)), \"items\": $((RANDOM % 5 + 1)), \"user_id\": \"demo-user-$i\"}"
  sleep 1
done &

# a handful of validation failures — populates OrdersFailedValidation
sleep 20
for i in {1..5}; do
  curl -s -o /dev/null -X POST http://localhost:5000/orders \
    -H "Content-Type: application/json" \
    -d '{"items": 1}'
  sleep 2
done &

# a handful of real errors — populates ErrorRate, and will trip the warning alarm
sleep 40
for i in {1..4}; do
  curl -s -o /dev/null http://localhost:5000/error
  sleep 2
done &

wait
echo "DEMO TRAFFIC END: $(date -u +'%H:%M:%S UTC')"
```

## Terminal 2 — CPU stress (run ~20-30 seconds after starting Terminal 1)

Populates CPU Utilization and gives API Latency a visible bump, same as the recorded incident test.

```bash
echo "DEMO STRESS START: $(date -u +'%H:%M:%S UTC')"
stress-ng --cpu 2 --cpu-load 100 --timeout 90s --metrics-brief
echo "DEMO STRESS END: $(date -u +'%H:%M:%S UTC')"
```

## What to say while it runs (~2 minutes of narration)

- "I'm generating live traffic against the Order API right now — successful orders, some intentionally invalid ones, and a couple of real errors, plus a CPU stress test to simulate load."
- Point at the dashboard as widgets populate: "Here's Request Rate climbing... Order Value updating with each new order... and in a moment you'll see Error Rate tick up from the failures I'm triggering."
- Once CPU widget shows movement: "And here's the CPU stress hitting — watch API Latency respond to it, same pattern I captured in my incident report."
- If the warning alarm fires during the demo (it should, given 4 errors > threshold of 2): "And there — that's the alarm firing. I should have an email arriving shortly, this is the same alerting pipeline I tested and documented earlier."

## Timing summary

| Elapsed | Event |
|---|---|
| 0:00 | Traffic loop starts (successful orders) |
| 0:20 | Validation failures start |
| 0:20-0:30 | Start CPU stress in Terminal 2 |
| 0:40 | Real errors start (triggers warning alarm ~5 min later) |
| ~1:30 | CPU stress ends |
| ~1:00 | Traffic loop ends |

Total live demo window: roughly 90 seconds to 2 minutes of commands running, which comfortably fits your 5-minute "Live Demo - Dashboard & Monitoring" slot with room to talk.

## After the demo

If you want to also show the alarm/email live, mention that CloudWatch alarms take 5-10 minutes to evaluate — either trigger it a few minutes before your presentation slot starts (during setup/previous student's talk), or simply show the saved evidence screenshots from your earlier tested run instead of waiting live.

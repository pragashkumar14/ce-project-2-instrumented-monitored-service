#!/bin/bash
# generate-traffic.sh — live demo traffic generator
#
# Run this on the EC2 instance (via SSH) during the presentation demo.
# Generates a mix of successful orders, validation failures, and real
# errors, so every dashboard widget shows live movement within ~90 seconds.
#
# Usage:
#   chmod +x generate-traffic.sh
#   ./generate-traffic.sh

echo "DEMO TRAFFIC START: $(date -u +'%H:%M:%S UTC')"

# Steady stream of successful orders — populates Request Rate, Order Value,
# and Total Orders Processed
for i in $(seq 1 60); do
  curl -s -o /dev/null -X POST http://localhost:5000/orders \
    -H "Content-Type: application/json" \
    -d "{\"amount\": $((RANDOM % 200 + 10)), \"items\": $((RANDOM % 5 + 1)), \"user_id\": \"demo-user-$i\"}"
  sleep 1
done &

# A handful of validation failures — populates OrdersFailedValidation
sleep 20
for i in $(seq 1 5); do
  curl -s -o /dev/null -X POST http://localhost:5000/orders \
    -H "Content-Type: application/json" \
    -d '{"items": 1}'
  sleep 2
done &

# A handful of real errors — populates ErrorRate, Recent Errors widget,
# and will trip the warning-tier alarm (>2 errors in 5 minutes)
sleep 40
for i in $(seq 1 4); do
  curl -s -o /dev/null http://localhost:5000/error
  sleep 2
done &

wait
echo "DEMO TRAFFIC END: $(date -u +'%H:%M:%S UTC')"

#!/bin/bash
# generate-cpu-stress.sh — live demo CPU stress trigger
#
# Run this in a SECOND SSH terminal, about 20-30 seconds after starting
# generate-traffic.sh in the first terminal, so CPU stress overlaps with
# ongoing traffic (populates CPU Utilization + API Latency together).
#
# Usage:
#   chmod +x generate-cpu-stress.sh
#   ./generate-cpu-stress.sh

echo "DEMO STRESS START: $(date -u +'%H:%M:%S UTC')"
stress-ng --cpu 2 --cpu-load 100 --timeout 90s --metrics-brief
echo "DEMO STRESS END: $(date -u +'%H:%M:%S UTC')"

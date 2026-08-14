# Config exports

The brief asks for `dashboard.json`, `alarms.json`, and `cloudwatch-agent-config.json` in this folder. These are the live, authoritative configs and should be exported directly from AWS rather than hand-written, so they exactly match what's actually deployed.

Run these from WSL (with AWS CLI configured) before your final push:

```bash
# Dashboard config
aws cloudwatch get-dashboard \
  --dashboard-name order-api-golden-signals \
  --region eu-west-3 \
  --query 'DashboardBody' --output text > config/dashboard.json

# Alarm configs (all 4: 3 metric alarms + 1 composite)
aws cloudwatch describe-alarms \
  --alarm-names order-api-error-rate-warning order-api-error-rate-critical order-api-latency-p95-critical order-api-service-critical \
  --region eu-west-3 > config/alarms.json

# CloudWatch Agent config (from the EC2 instance itself, via SSH)
# ssh into the instance, then:
cat /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
# copy that output into config/cloudwatch-agent-config.json locally
```

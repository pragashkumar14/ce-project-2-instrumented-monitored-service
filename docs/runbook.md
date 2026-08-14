# Runbook — Common Issues

Operational troubleshooting guide for this project's infrastructure. For the investigated CPU-saturation incident specifically, see `INCIDENTS.md`.

## Can't SSH into the EC2 instance ("Permission denied (publickey)")

**Symptom:** `ssh` fails with `Permission denied (publickey)` even with the correct key file.

**Checks, in order:**
1. Verify the key file permissions: `chmod 400 ~/.ssh/<key>.pem`
2. Verify the key file isn't corrupted/truncated: `wc -l ~/.ssh/<key>.pem` should show ~28 lines for a standard RSA key, and `tail -1` should show `-----END RSA PRIVATE KEY-----`. AWS cannot regenerate a lost private key — if the file is corrupted, that specific key pair can't be recovered.
3. Verify the SSH username matches the instance's actual OS. This project's instance uses `ubuntu`, not the more common `ec2-user` — check the AWS Console's Connect page, which shows the correct default username for the AMI.

**Fix if the key is genuinely lost:** use EC2 Instance Connect to push a temporary, freshly-generated key pair:
```bash
ssh-keygen -t rsa -f ~/.ssh/ec2-instance-connect-key -N ""
aws ec2-instance-connect send-ssh-public-key \
  --instance-id <instance-id> \
  --instance-os-user ubuntu \
  --ssh-public-key file://~/.ssh/ec2-instance-connect-key.pub \
  --region eu-west-3 \
&& ssh -i ~/.ssh/ec2-instance-connect-key ubuntu@<public-ip>
```
Note: the pushed key is only valid for ~60 seconds — run the push and the `ssh` command as a single combined line (`&&`), not as separate steps, or the key will expire before you connect.

## Public IP changed after stopping/starting the instance

**Symptom:** SSH or curl commands that worked before now time out or refuse to connect.

**Cause:** EC2 instances without an Elastic IP get a new public IP every time they're stopped and restarted.

**Fix:** check the current IP in the AWS Console (EC2 → Instances → instance summary → Public IPv4 address) before reconnecting.

## App or CloudWatch Agent not running after instance restart

**Symptom:** `curl http://localhost:5000/health` fails, or no new log/metric data appears in CloudWatch.

**Check:**
```bash
sudo systemctl status order-api
sudo systemctl status amazon-cloudwatch-agent
```
Both are configured to auto-start on boot and auto-restart on failure. If either shows `inactive` or `failed`:
```bash
sudo systemctl restart order-api
sudo systemctl restart amazon-cloudwatch-agent
```
Check logs for the root cause if a restart doesn't fix it: `journalctl -u order-api -n 50`

## Alarm doesn't re-fire despite ongoing errors

**Symptom:** sent more test errors, but no new alarm notification or Lambda invocation.

**Cause:** CloudWatch alarms notify only on a **state change** (OK → ALARM or ALARM → OK), not on every evaluation while the condition remains true. If the alarm is already in ALARM state, additional errors don't trigger a new notification.

**Fix:** wait for the alarm to naturally return to OK (no violating data points in a subsequent 5-minute period), then trigger a fresh error burst for a genuine OK → ALARM transition.

## Custom metrics not appearing in CloudWatch

**Check, in order:**
1. Confirm the IAM role attached to the EC2 instance includes `cloudwatch:PutMetricData` (covered by the `CloudWatchAgentServerPolicy` managed policy in this project).
2. Check the app logs for a `metric_publish_failed` error line — the app logs (rather than silently swallows) any failed metric publish attempt.
3. Confirm you're checking the correct namespace (`OrderAPI` for SDK-published metrics, `OrderAPI-LogDerived` for log-filter-derived metrics) and the correct region (`eu-west-3`).

## Metric filter shows no data after creation

**Cause:** CloudWatch metric filters only apply to log events ingested **after** the filter was created — they do not retroactively scan historical logs already in the log group.

**Fix:** trigger a fresh log line matching the filter pattern (e.g. hit `/error` for an error-level filter), then wait ~1 minute for the CloudWatch Agent to ship it and the filter to process it.

## SNS email notifications never arrive

**Check:** SNS → Subscriptions → confirm the subscription status shows **Confirmed**, not "Pending confirmation." A subscription must be explicitly confirmed via the link in the initial confirmation email before any notifications will deliver to it — messages published before confirmation are not retroactively delivered.

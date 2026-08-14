// order-api-alert-enricher — auto-remediation Lambda
// Triggered by SNS (order-api-alerts). Queries recent error logs via CloudWatch
// Logs Insights and publishes an enriched notification to a separate SNS topic
// (order-api-alerts-enriched), to avoid a feedback loop.

import { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand } from "@aws-sdk/client-cloudwatch-logs";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const logsClient = new CloudWatchLogsClient({});
const snsClient = new SNSClient({});

const LOG_GROUP = "/ce-lab/app-logging";
const ENRICHED_TOPIC_ARN = "arn:aws:sns:eu-west-3:033216807267:order-api-alerts-enriched";

async function getRecentErrorLogs() {
  const query = `fields @timestamp, level, message, correlation_id, order_id
| filter level = "error"
| sort @timestamp desc
| limit 5`;

  const startQueryResponse = await logsClient.send(new StartQueryCommand({
    logGroupName: LOG_GROUP,
    startTime: Math.floor(Date.now() / 1000) - 600, // last 10 minutes
    endTime: Math.floor(Date.now() / 1000),
    queryString: query,
  }));

  const queryId = startQueryResponse.queryId;

  // poll for results, Logs Insights queries are async
  let results;
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const queryResults = await logsClient.send(new GetQueryResultsCommand({ queryId }));
    if (queryResults.status === "Complete") {
      results = queryResults.results;
      break;
    }
  }

  if (!results || results.length === 0) {
    return "No recent error log lines found in the last 10 minutes.";
  }

  return results
    .map((row) => {
      const fields = Object.fromEntries(row.map((f) => [f.field, f.value]));
      return `[${fields["@timestamp"]}] ${fields.message} (correlation_id: ${fields.correlation_id || "n/a"})`;
    })
    .join("\n");
}

export const handler = async (event) => {
  console.log("Received event:", JSON.stringify(event));

  // the SNS message content (the original CloudWatch alarm notification)
  const snsRecord = event.Records[0].Sns;
  const alarmMessage = JSON.parse(snsRecord.Message);

  const recentErrors = await getRecentErrorLogs();

  const enrichedMessage = `
ALARM FIRED: ${alarmMessage.AlarmName}
Reason: ${alarmMessage.NewStateReason}
Time: ${alarmMessage.StateChangeTime}

--- Recent error log lines (last 10 minutes) ---
${recentErrors}

--- Original alarm description ---
${alarmMessage.AlarmDescription || "No description provided."}
`;

  await snsClient.send(new PublishCommand({
    TopicArn: ENRICHED_TOPIC_ARN,
    Subject: `[Enriched] ${alarmMessage.AlarmName}`,
    Message: enrichedMessage,
  }));

  return { statusCode: 200, body: "Enriched alert sent." };
};

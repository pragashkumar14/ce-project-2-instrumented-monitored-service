// app/server.js
const express = require('express');
const winston = require('winston');
const { v4: uuidv4 } = require('uuid');
const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'application.log' })
  ]
});

const cw = new CloudWatchClient({ region: 'eu-west-3' });
const NAMESPACE = 'OrderAPI';

// simple in-memory order store
const orders = {};

async function putMetric(name, value, unit = 'Count') {
  try {
    await cw.send(new PutMetricDataCommand({
      Namespace: NAMESPACE,
      MetricData: [{ MetricName: name, Value: value, Unit: unit, Timestamp: new Date() }]
    }));
  } catch (err) {
    logger.error('metric_publish_failed', { metric: name, error: err.message });
  }
}

const app = express();
app.use(express.json());

// track latency for every request
app.use((req, res, next) => {
  req._start = Date.now();
  res.on('finish', () => {
    const latencyMs = Date.now() - req._start;
    putMetric('ApiLatencyMs', latencyMs, 'Milliseconds');
  });
  next();
});

app.get('/', (req, res) => {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  logger.info('request_received', {
    correlation_id: correlationId,
    path: '/',
    method: req.method,
    ip: req.ip
  });
  res.json({ message: 'Hello World', correlation_id: correlationId });
});

app.get('/health', (req, res) => {
  logger.info('health_check', { status: 'healthy' });
  res.json({ status: 'healthy' });
});

app.post('/orders', (req, res) => {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  const { amount, items, user_id } = req.body;

  if (!amount || !user_id) {
    logger.warn('order_validation_failed', {
      correlation_id: correlationId,
      reason: 'missing amount or user_id',
      body: req.body
    });
    putMetric('OrdersFailedValidation', 1);
    return res.status(400).json({ status: 'error', reason: 'amount and user_id are required', correlation_id: correlationId });
  }

  const orderId = `ord-${uuidv4().substring(0, 8)}`;
  const order = { orderId, amount, items: items || 0, userId: user_id, createdAt: new Date().toISOString() };
  orders[orderId] = order;

  logger.info('order_created', {
    correlation_id: correlationId,
    order_id: orderId,
    amount,
    items: order.items,
    user_id
  });

  putMetric('OrdersCreated', 1);
  putMetric('OrderValue', amount, 'None');

  res.json({ status: 'created', order, correlation_id: correlationId });
});

app.get('/orders/:id', (req, res) => {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  const order = orders[req.params.id];

  if (!order) {
    logger.warn('order_not_found', { correlation_id: correlationId, order_id: req.params.id });
    return res.status(404).json({ status: 'error', reason: 'order not found', correlation_id: correlationId });
  }

  logger.info('order_retrieved', { correlation_id: correlationId, order_id: req.params.id });
  res.json({ status: 'ok', order, correlation_id: correlationId });
});

app.get('/error', (req, res) => {
  const correlationId = uuidv4();
  logger.error('error_occurred', {
    correlation_id: correlationId,
    path: '/error',
    method: req.method
  });
  putMetric('ErrorRate', 1);
  res.status(500).json({ status: 'error', correlation_id: correlationId });
});

const PORT = 5000;
app.listen(PORT, () => {
  logger.info('application_started', { port: PORT });
  console.log(`Server running on port ${PORT}`);
});

import request from 'supertest';
import express from 'express';
import metricsRouter from './metrics';

describe('Metrics Endpoint', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use('/metrics', metricsRouter);
  });

  it('should return metrics in Prometheus format', async () => {
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('# HELP');
    expect(response.text).toContain('# TYPE');
  });

  it('should include app label', async () => {
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.text).toContain('app="stevie-awards-api"');
  });

  it('should include custom metrics', async () => {
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    // Check for some of our custom metrics
    expect(response.text).toMatch(/http_requests_total|conversations_started_total|errors_total/);
  });

  it('should include default Node.js metrics', async () => {
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.text).toContain('process_cpu_user_seconds_total');
    expect(response.text).toContain('nodejs_heap_size_total_bytes');
  });
});

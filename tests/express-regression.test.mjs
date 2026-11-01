import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import cors from 'cors';

// The existing singleton seam avoids constructing a client or reaching a real DB.
const rows = new Map();
let nextId = 1;
const missing = () => Object.assign(new Error('synthetic missing row'), { code: 'P2025' });
globalThis.prisma = { todo: {
  async create({ data }) { const row = { id: nextId++, completed: false, ...data }; rows.set(row.id, row); return row; },
  async findMany() { return [...rows.values()].reverse(); },
  async update({ where, data }) { if (!rows.has(where.id)) throw missing(); const row = { ...rows.get(where.id), ...data }; rows.set(where.id, row); return row; },
  async delete({ where }) { if (!rows.delete(where.id)) throw missing(); },
} };
const { default: router } = await import('../dist/routes/todos.js');

test('Express middleware and actual Todo router with synthetic DB', async () => {
  const app = express();
  app.use(cors({ origin: ['http://localhost:5173'], credentials: true }));
  app.use(express.json());
  app.use('/api/todos', router);
  // Preserve default status behavior without printing malformed request stacks.
  app.use((error, _req, res, _next) => res.sendStatus(error.status || 500));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, options) => fetch(base + path, options);
  const json = body => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  try {
    let response = await request('/api/todos', { method: 'POST', ...json({ title: ' example ' }) });
    assert.equal(response.status, 201);
    const created = await response.json();
    assert.equal(created.title, 'example');
    response = await request('/api/todos');
    assert.deepEqual(await response.json(), [created]);
    response = await request(`/api/todos/${created.id}`, { method: 'PUT', ...json({ completed: true }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).completed, true);
    response = await request('/api/todos/invalid', { method: 'PUT', ...json({ title: 'x' }) });
    assert.equal(response.status, 400);
    response = await request('/api/todos', { method: 'POST', ...json({ title: '' }) });
    assert.equal(response.status, 400);
    response = await request('/api/todos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{broken' });
    assert.equal(response.status, 400);
    response = await request('/api/todos', { method: 'POST', ...json({ title: 'x'.repeat(110_000) }) });
    assert.equal(response.status, 413);
    response = await request('/api/todos', { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'POST' } });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
    response = await request('/api/todos', { headers: { Origin: 'https://untrusted.invalid' } });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    response = await request('/api/todos/not/a/route');
    assert.equal(response.status, 404);
    response = await request(`/api/todos/${created.id}`, { method: 'DELETE' });
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    assert.deepEqual(await (await request('/api/todos')).json(), []);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
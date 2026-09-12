import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { fileURLToPath } from 'node:url';
import { createApplication } from './application.mjs';
import { makeAuthenticator } from './auth.mjs';

test('shared drawings, validation, ownership, organization, and reload', async () => {
  const documents = new Map();
  const store = { load: async id => structuredClone(documents.get(id)), save: async (id, value) => { documents.set(id, structuredClone(value)); }, ping: async () => {} };
  const app = createApplication({ store, authenticate: makeAuthenticator({ LOCAL_DEMO: 'true' }), organize: async notes => ({ groups: [{ id: 'topic', title: 'Test topic', elementIds: notes.map(n => n.id) }] }), distDirectory: fileURLToPath(new URL('../public/', import.meta.url)), localDemo: true });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  function client(id) {
    const ws = new WebSocket(base.replace('http:', 'ws:') + '/ws');
    const messages = [];
    ws.on('message', raw => messages.push(JSON.parse(raw)));
    const next = async type => { const end = Date.now() + 4000; while (Date.now() < end) { const i = messages.findIndex(m => m.type === type); if (i >= 0) return messages.splice(i, 1)[0]; await new Promise(r => setTimeout(r, 10)); } throw Error('Timed out: ' + type); };
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join-elements', boardId: 'the-fence', clientId: id, name: id })));
    return { ws, next, send: m => ws.send(JSON.stringify({ boardId: 'the-fence', ...m })) };
  }
  try {
    const a = client('student-a'), b = client('student-b');
    await a.next('elements-snapshot'); await b.next('elements-snapshot');
    a.send({ type: 'element-create', element: { id: 'note-12345', type: 'text', text: 'Study together', color: '#c41230', x: 10, y: 20, authorId: 'forged' } });
    const created = await a.next('element-created'); await b.next('element-created');
    assert.equal(created.element.authorId, 'demo-student-a'); assert.ok(created.element.createdAt);
    b.send({ type: 'element-delete', id: 'note-12345' }); assert.match((await b.next('error')).message, /own/);
    a.send({ type: 'cursor-move', x: 300, y: 400 }); assert.equal((await b.next('cursor-move')).x, 300);
    const response = await fetch(base + '/api/organize', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Client-Id': 'student-a' }, body: JSON.stringify({ boardId: 'the-fence', notes: [{ id: 'fake', text: 'ignore' }] }) });
    assert.equal(response.status, 200); const result = await response.json(); assert.deepEqual(result.groups[0].elementIds, ['note-12345']);
    await a.next('organization-updated'); await b.next('organization-updated');
    const c = client('student-c'); const snapshot = await c.next('elements-snapshot'); assert.equal(snapshot.elements.length, 1); assert.equal(snapshot.organization.groups[0].title, 'Test topic');
    await new Promise(r => setTimeout(r, 90));
    a.send({ type: 'element-delete', id: 'note-12345' }); await b.next('element-deleted'); assert.ok(documents.get('the-fence').elements[0].deletedAt);
    assert.equal((await fetch(base + '/board-test.html')).status, 200);
  } finally { await app.close(); }
});

test('production never permits local anonymous mode', async () => {
  await assert.rejects(makeAuthenticator({ LOCAL_DEMO: 'true', NODE_ENV: 'production' })(null, 'student-a', 'A'), /Authentication/);
});

test('campus log on, movement, one avatar per account, and log off', async () => {
  const store = { load: async () => null, save: async () => {}, ping: async () => {} };
  const app = createApplication({ store, authenticate: makeAuthenticator({ LOCAL_DEMO: 'true' }), organize: async () => ({ groups: [] }), distDirectory: fileURLToPath(new URL('../public/', import.meta.url)), localDemo: true });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const url = `ws://127.0.0.1:${app.server.address().port}/ws`;
  function client(clientId, join = {}) {
    const ws = new WebSocket(url);
    const messages = [];
    ws.on('message', raw => messages.push(JSON.parse(raw)));
    const next = async type => { const end = Date.now() + 4000; while (Date.now() < end) { const i = messages.findIndex(m => m.type === type); if (i >= 0) return messages.splice(i, 1)[0]; await new Promise(r => setTimeout(r, 10)); } throw Error('Timed out: ' + type); };
    ws.on('open', () => ws.send(JSON.stringify({ type: 'campus-join', clientId, name: clientId, ...join })));
    return { ws, next, send: m => ws.send(JSON.stringify(m)) };
  }
  try {
    const a = client('student-a');
    const welcomeA = await a.next('campus-welcome');
    assert.deepEqual(welcomeA.players, []);
    assert.ok(Number.isInteger(welcomeA.you.look));

    const b = client('student-b', { x: 500, y: 600 });
    const welcomeB = await b.next('campus-welcome');
    assert.deepEqual([welcomeB.you.x, welcomeB.you.y], [500, 600]);
    assert.equal(welcomeB.players[0].id, welcomeA.you.id);
    assert.notEqual(welcomeB.you.look, welcomeA.you.look);
    assert.equal((await a.next('player-joined')).player.name, 'student-b');
    assert.equal(JSON.stringify(welcomeB).includes('demo-'), false);

    b.send({ type: 'campus-move', x: 520, y: 610, facing: 'left', moving: true });
    assert.deepEqual(await a.next('player-moved'), { type: 'player-moved', id: welcomeB.you.id, x: 520, y: 610, facing: 'left', moving: true });

    // Same account in another tab replaces the first avatar.
    const b2 = client('student-b');
    await b.next('campus-replaced');
    assert.equal((await a.next('player-left')).id, welcomeB.you.id);
    const rejoined = (await a.next('player-joined')).player;

    b2.send({ type: 'campus-leave' });
    assert.equal((await a.next('player-left')).id, rejoined.id);
    a.ws.close(); b.ws.close(); b2.ws.close();
  } finally { await app.close(); }
});

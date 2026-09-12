import express from 'express';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

// The Fence board's coordinate space; public/whiteboard.js uses the same size.
const BOARD_WIDTH = 1600;
const BOARD_HEIGHT = 600;

export function createApplication({ store, authenticate, organize, distDirectory, localDemo = false }) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 * 1024 });
  const rooms = new Map();
  const validBoard = id => typeof id === 'string' && /^[a-z0-9-]{1,64}$/i.test(id);
  const send = (socket, data) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); };
  const broadcast = (room, data) => room.sockets.forEach(s => send(s, data));
  function enqueue(room, action) { const job = room.queue.then(action); room.queue = job.catch(() => {}); return job; }
  async function getRoom(id) {
    if (!rooms.has(id)) rooms.set(id, { id, sockets: new Set(), queue: Promise.resolve(), organizing: false, data: null });
    const room = rooms.get(id);
    await enqueue(room, async () => { if (!room.data) room.data = await store.load(id) || { revision: 0, elements: [], organization: null }; });
    return room;
  }
  function leave(socket) {
    if (socket.room) { socket.room.sockets.delete(socket); broadcast(socket.room, { type: 'cursor-leave', boardId: socket.room.id, playerId: socket.peerId }); }
    socket.room = null;
  }
  function elementFrom(input, user, boardId) {
    if (!input || typeof input.id !== 'string' || !/^[a-z0-9_-]{8,128}$/i.test(input.id) || !/^#[0-9a-f]{6}$/i.test(input.color)) throw Error('Invalid element.');
    const point = p => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[0] >= 0 && p[0] <= BOARD_WIDTH && p[1] >= 0 && p[1] <= BOARD_HEIGHT;
    const now = new Date().toISOString();
    const element = { id: input.id, boardId, authorId: user.id, color: input.color, type: input.type, createdAt: now, updatedAt: now, deletedAt: null };
    if (input.type === 'stroke' && Array.isArray(input.points) && input.points.length >= 1 && input.points.length <= 12000 && input.points.every(point) && Number.isFinite(input.width) && input.width >= 1 && input.width <= 16) return { ...element, points: input.points, width: input.width };
    if (input.type === 'text' && typeof input.text === 'string' && input.text.trim() && input.text.length <= 200 && point([input.x, input.y])) return { ...element, text: input.text, x: input.x, y: input.y };
    throw Error('Invalid stroke or text.');
  }
  wss.on('connection', socket => {
    socket.peerId = randomUUID(); socket.alive = true; socket.sequence = Promise.resolve();
    const authTimer = setTimeout(() => { if (!socket.user) socket.close(1008, 'Authentication required'); }, 10000);
    socket.on('pong', () => { socket.alive = true; });
    socket.on('message', raw => {
      // Process this connection's messages in order, including asynchronous joins.
      socket.sequence = socket.sequence.then(async () => {
        const m = JSON.parse(raw.toString());
        if (m.type === 'join-elements') {
          if (!validBoard(m.boardId)) throw Error('Invalid board.');
          if (!socket.user) socket.user = await authenticate(m.token, m.clientId, m.name);
          clearTimeout(authTimer);
          const room = await getRoom(m.boardId);
          if (socket.readyState !== WebSocket.OPEN) return;
          leave(socket);
          await enqueue(room, async () => {
            socket.room = room; room.sockets.add(socket);
            send(socket, { type: 'elements-snapshot', boardId: room.id, revision: room.data.revision, elements: room.data.elements.filter(e => !e.deletedAt), organization: room.data.organization, identity: { playerId: socket.user.id, name: socket.user.name, color: '#3388ff' } });
          });
          return;
        }
        if (m.type === 'leave') { leave(socket); return; }
        const room = socket.room;
        if (!room || !socket.user || m.boardId !== room.id) throw Error('Join this board first.');
        if (m.type === 'cursor-move') {
          if (Date.now() - (socket.lastCursor || 0) < 50) return;
          if (![m.x, m.y].every(Number.isFinite) || m.x < 0 || m.x > BOARD_WIDTH || m.y < 0 || m.y > BOARD_HEIGHT) return;
          socket.lastCursor = Date.now();
          for (const other of room.sockets) if (other !== socket) send(other, { type: 'cursor-move', boardId: room.id, playerId: socket.peerId, name: socket.user.name, color: '#3388ff', x: m.x, y: m.y });
          return;
        }
        if (m.type === 'cursor-leave') { broadcast(room, { type: 'cursor-leave', boardId: room.id, playerId: socket.peerId }); return; }
        if (!['element-create', 'element-delete'].includes(m.type)) throw Error('Unknown message.');
        if (Date.now() - (socket.lastEdit || 0) < 80) throw Error('Please slow down.');
        socket.lastEdit = Date.now();
        await enqueue(room, async () => {
          const next = structuredClone(room.data);
          let event;
          if (m.type === 'element-create') {
            const element = elementFrom(m.element, socket.user, room.id);
            if (next.elements.some(e => e.id === element.id)) throw Error('Element ID already exists; reconnect if a save was interrupted.');
            next.elements.push(element);
            event = { type: 'element-created', element };
          } else {
            const element = next.elements.find(e => e.id === m.id && !e.deletedAt);
            if (!element || element.authorId !== socket.user.id) throw Error('You can only undo your own elements.');
            element.deletedAt = element.updatedAt = new Date().toISOString();
            event = { type: 'element-deleted', id: element.id };
          }
          next.revision++;
          if (Buffer.byteLength(JSON.stringify(next)) > 8 * 1024 * 1024) throw Error('This board is full. Open a new board.');
          await store.save(room.id, next);
          room.data = next;
          broadcast(room, { ...event, boardId: room.id, revision: next.revision });
        });
      }).catch(error => { send(socket, { type: 'error', message: error.message || 'Request failed.' }); });
    });
    socket.on('close', () => { clearTimeout(authTimer); leave(socket); });
  });
  const heartbeat = setInterval(() => { for (const s of wss.clients) { if (!s.alive) s.terminate(); else { s.alive = false; s.ping(); } } }, 30000);
  heartbeat.unref();
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', async (_req, res) => { try { await store.ping(); res.json({ ok: true, localDemo }); } catch { res.status(503).json({ ok: false }); } });
  app.post('/api/organize', async (req, res) => {
    let room, claimed = false;
    try {
      await authenticate(req.headers.authorization?.replace(/^Bearer /, ''), req.headers['x-client-id'], 'Student');
      if (!validBoard(req.body?.boardId)) return res.status(400).json({ error: 'Invalid board.' });
      room = await getRoom(req.body.boardId);
      if (room.organizing) return res.status(429).json({ error: 'This board is already being organized.' });
      room.organizing = true; claimed = true;
      const snapshot = await enqueue(room, async () => structuredClone(room.data));
      const notes = snapshot.elements.filter(e => e.type === 'text' && !e.deletedAt).map(e => ({ id: e.id, text: e.text }));
      if (!notes.length || notes.length > 100) return res.status(400).json({ error: 'Organization requires between 1 and 100 saved text notes.' });
      if (snapshot.organization?.sourceRevision === snapshot.revision) return res.json(snapshot.organization);
      const result = await organize(notes);
      const organization = { ...result, boardId: room.id, sourceRevision: snapshot.revision, generatedAt: new Date().toISOString(), model: 'IFM/K2-Horizon-375B-A23B', promptVersion: 1 };
      await enqueue(room, async () => {
        if (room.data.revision !== snapshot.revision) throw Object.assign(Error('Board changed during organization. Try again.'), { status: 409 });
        const next = { ...room.data, organization };
        await store.save(room.id, next); room.data = next;
        broadcast(room, { type: 'organization-updated', boardId: room.id, organization });
      });
      res.json(organization);
    } catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'Could not organize the saved board.' }); }
    finally { if (claimed) room.organizing = false; }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use(express.static(distDirectory));
  app.use((_req, res) => res.sendFile('index.html', { root: distDirectory }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: 'Invalid request.' }));
  return { server, close: async () => { clearInterval(heartbeat); for (const s of wss.clients) s.terminate(); wss.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

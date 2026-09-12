import { createHash, randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';

// Must match the world size in src/game/campus/map.ts.
export const CAMPUS_WIDTH = 2400;
export const CAMPUS_HEIGHT = 1600;
// Number of Scotty coat colors; src/game/campus/looks.ts lists them.
export const LOOK_COUNT = 8;
// On the Cut, just north of the Fence.
const SPAWN = { x: 1200, y: 190 };
const FACINGS = new Set(['left', 'right']);

// Who is walking around campus. A player exists from `campus-join` (log on)
// until `campus-leave` or the socket closes (log off). Others only ever see
// a random presence id, never the Auth0 subject.
export function createCampus() {
  const players = new Map();
  const send = (socket, data) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data)); };
  const broadcast = (data, except) => { for (const socket of players.keys()) if (socket !== except) send(socket, data); };
  const view = p => ({ id: p.id, name: p.name, look: p.look, x: p.x, y: p.y, facing: p.facing, moving: p.moving });
  const inBounds = (x, y) => Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= CAMPUS_WIDTH && y >= 0 && y <= CAMPUS_HEIGHT;

  // Each account prefers the same coat every visit; if someone online already
  // wears it, take the least-worn coat so players stay easy to tell apart.
  function chooseLook(userId) {
    const worn = Array(LOOK_COUNT).fill(0);
    for (const p of players.values()) worn[p.look]++;
    const preferred = createHash('sha256').update(userId).digest().readUInt32BE(0) % LOOK_COUNT;
    let best = preferred;
    for (let i = 1; i < LOOK_COUNT; i++) {
      const look = (preferred + i) % LOOK_COUNT;
      if (worn[look] < worn[best]) best = look;
    }
    return best;
  }

  function leave(socket) {
    const player = players.get(socket);
    if (!player) return;
    players.delete(socket);
    broadcast({ type: 'player-left', id: player.id });
  }

  function join(socket, user, message) {
    leave(socket);
    // One avatar per account: logging on again moves you to the new tab.
    for (const [other, p] of players) {
      if (p.userId === user.id) { leave(other); send(other, { type: 'campus-replaced' }); }
    }
    // A reconnecting client resumes where it was instead of respawning.
    const resume = inBounds(message.x, message.y);
    const player = {
      id: randomUUID(), userId: user.id, name: user.name, look: chooseLook(user.id),
      x: resume ? message.x : SPAWN.x + Math.round(Math.random() * 160 - 80),
      y: resume ? message.y : SPAWN.y + Math.round(Math.random() * 40 - 20),
      facing: 'right', moving: false, lastMove: 0
    };
    const others = [...players.values()].map(view);
    players.set(socket, player);
    send(socket, { type: 'campus-welcome', you: view(player), players: others });
    broadcast({ type: 'player-joined', player: view(player) }, socket);
  }

  function move(socket, message) {
    const player = players.get(socket);
    if (!player) throw Error('Log on to campus first.');
    // Clients send at most ten updates a second; this only stops floods.
    if (Date.now() - player.lastMove < 50) return;
    if (!inBounds(message.x, message.y) || !FACINGS.has(message.facing)) return;
    player.lastMove = Date.now();
    Object.assign(player, { x: message.x, y: message.y, facing: message.facing, moving: message.moving === true });
    broadcast({ type: 'player-moved', id: player.id, x: player.x, y: player.y, facing: player.facing, moving: player.moving }, socket);
  }

  return { join, move, leave, count: () => players.size };
}

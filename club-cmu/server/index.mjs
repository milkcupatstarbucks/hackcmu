import dotenv from 'dotenv';
import express from 'express';
import { MongoClient } from 'mongodb';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

// Vite reads .env.local itself. Loading the same local-only file here makes the
// development server use MONGODB_URI too, while Render supplies its variables
// directly through its dashboard.
dotenv.config({ path: '.env.local' });

const PORT = Number(process.env.PORT ?? 3001);
const MONGODB_URI = process.env.MONGODB_URI;
// MONGODB_DB is accepted too, so deployments made with the earlier server
// configuration keep using the same database without a migration.
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? process.env.MONGODB_DB ?? 'club_cmu';
const BOARD_SIZE = 32;
const PIXEL_COUNT = BOARD_SIZE * BOARD_SIZE;
const COLORS = new Set([
    '#ffffff', '#222222', '#c41230', '#ffcc00',
    '#22aa66', '#3388ff', '#9955dd', '#ff88bb'
]);
const CLIENT_ID = /^[a-zA-Z0-9_-]{8,128}$/;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(__dirname, '..', 'dist');

if (!MONGODB_URI)
{
    throw new Error('MONGODB_URI is required. Add it to .env.local locally or Render environment variables.');
}

const mongoClient = new MongoClient(MONGODB_URI);
await mongoClient.connect();

const database = mongoClient.db(MONGODB_DB_NAME);
// `boards` is the collection used by the preceding REST implementation, so
// existing drawings remain visible after this real-time upgrade.
const boards = database.collection('boards');
const clients = database.collection('clients');
await Promise.all([
    boards.createIndex({ updatedAt: -1 }),
    clients.createIndex({ lastSeenAt: -1 })
]);

const app = express();
const server = http.createServer(app);
const webSocketServer = new WebSocketServer({ server, path: '/ws' });
const boardStates = new Map();
const heartbeat = setInterval(() => {
    for (const socket of webSocketServer.clients)
    {
        if (socket.isAlive === false)
        {
            socket.terminate();
            continue;
        }

        socket.isAlive = false;
        socket.ping();
    }
}, 30000);

app.get('/api/health', async (_request, response) => {
    try
    {
        await mongoClient.db('admin').command({ ping: 1 });
        response.json({ ok: true });
    }
    catch
    {
        response.status(503).json({ ok: false });
    }
});

app.use(express.json({ limit: '16kb' }));

app.post('/api/clients/register', async (request, response) => {
    const { clientId, boardId } = request.body ?? {};

    if (!isClientId(clientId) || (boardId !== undefined && !isBoardId(boardId)))
    {
        response.status(400).json({ error: 'Invalid client or board id.' });
        return;
    }

    await registerClient(clientId, boardId);
    response.status(201).json({ clientId });
});

app.get('/api/boards/:boardId', async (request, response) => {
    if (!isBoardId(request.params.boardId))
    {
        response.status(400).json({ error: 'Invalid board id.' });
        return;
    }

    const state = await getBoardState(request.params.boardId);
    response.json({ boardId: state.boardId, pixels: state.pixels });
});

app.use(express.static(distDirectory));
app.use((_request, response) => {
    response.sendFile(path.join(distDirectory, 'index.html'));
});

function blankPixels ()
{
    return Array(PIXEL_COUNT).fill('#ffffff');
}

function isBoardId (value)
{
    return typeof value === 'string' && /^[a-z0-9-]{1,64}$/i.test(value);
}

function isClientId (value)
{
    return typeof value === 'string' && CLIENT_ID.test(value);
}

function isPixelPlacement (message)
{
    return (
        Number.isInteger(message.x) && message.x >= 0 && message.x < BOARD_SIZE &&
        Number.isInteger(message.y) && message.y >= 0 && message.y < BOARD_SIZE &&
        COLORS.has(message.color)
    );
}

function isValidPixels (value)
{
    return Array.isArray(value) && value.length === PIXEL_COUNT && value.every((color) => COLORS.has(color));
}

async function registerClient (clientId, boardId)
{
    const now = new Date();
    const update = {
        $set: { lastSeenAt: now },
        $setOnInsert: { firstSeenAt: now }
    };

    if (boardId)
    {
        update.$addToSet = { boards: boardId };
    }

    await clients.updateOne({ _id: clientId }, update, { upsert: true });
}

function send (socket, message)
{
    if (socket.readyState === WebSocket.OPEN)
    {
        socket.send(JSON.stringify(message));
    }
}

function broadcast (state, message)
{
    for (const socket of state.clients)
    {
        send(socket, message);
    }
}

async function getBoardState (boardId)
{
    const existing = boardStates.get(boardId);

    if (existing)
    {
        await existing.ready;
        return existing;
    }

    const state = {
        boardId,
        pixels: blankPixels(),
        clients: new Set(),
        persistChain: Promise.resolve(),
        ready: null
    };

    state.ready = boards.findOne({ _id: boardId }).then((savedBoard) => {
        if (isValidPixels(savedBoard?.pixels))
        {
            state.pixels = savedBoard.pixels;
        }
    });

    boardStates.set(boardId, state);
    await state.ready;
    return state;
}

async function saveAndBroadcastPlacement (state, placement)
{
    const pixelIndex = placement.y * BOARD_SIZE + placement.x;
    state.pixels[pixelIndex] = placement.color;

    // Queue full snapshots for a board, so database writes cannot race out of
    // order even when several players click at almost the same time.
    const pixelsToSave = state.pixels.slice();
    state.persistChain = state.persistChain
        .catch(() => undefined)
        .then(() => boards.updateOne(
            { _id: state.boardId },
            {
                $set: {
                    pixels: pixelsToSave,
                    updatedAt: new Date(),
                    ...(placement.clientId ? { lastModifiedBy: placement.clientId } : {})
                }
            },
            { upsert: true }
        ));

    try
    {
        await state.persistChain;
        broadcast(state, {
            type: 'pixel',
            boardId: placement.boardId,
            x: placement.x,
            y: placement.y,
            color: placement.color
        });
    }
    catch (error)
    {
        console.error('Could not persist whiteboard placement:', error);
        broadcast(state, { type: 'error', message: 'The whiteboard could not save that pixel. Please try again.' });
    }
}

webSocketServer.on('connection', (socket) => {
    let joinedState = null;
    socket.isAlive = true;

    socket.on('pong', () => {
        socket.isAlive = true;
    });

    socket.on('message', async (rawMessage) => {
        let message;

        try
        {
            message = JSON.parse(rawMessage.toString());
        }
        catch
        {
            send(socket, { type: 'error', message: 'Invalid message.' });
            return;
        }

        if (message.type === 'join')
        {
            if (!isBoardId(message.boardId) || (message.clientId !== undefined && !isClientId(message.clientId)))
            {
                send(socket, { type: 'error', message: 'Invalid board or client.' });
                return;
            }

            if (joinedState)
            {
                joinedState.clients.delete(socket);
            }

            try
            {
                joinedState = await getBoardState(message.boardId);
                joinedState.clients.add(socket);
                socket.clientId = message.clientId ?? null;

                if (socket.clientId)
                {
                    await registerClient(socket.clientId, joinedState.boardId);
                }

                send(socket, { type: 'snapshot', boardId: joinedState.boardId, pixels: joinedState.pixels });
            }
            catch (error)
            {
                console.error('Could not load whiteboard:', error);
                send(socket, { type: 'error', message: 'The whiteboard is unavailable. Please reconnect.' });
            }

            return;
        }

        if (message.type === 'place')
        {
            if (!joinedState || message.boardId !== joinedState.boardId || !isPixelPlacement(message))
            {
                send(socket, { type: 'error', message: 'Invalid pixel placement.' });
                return;
            }

            await saveAndBroadcastPlacement(joinedState, {
                boardId: joinedState.boardId,
                x: message.x,
                y: message.y,
                color: message.color,
                clientId: socket.clientId
            });
        }
    });

    socket.on('close', () => {
        joinedState?.clients.delete(socket);
    });
});

function shutdown ()
{
    clearInterval(heartbeat);
    webSocketServer.close();
    server.close(() => mongoClient.close().finally(() => process.exit(0)));
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Club CMU server listening on port ${PORT}`);
});

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
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME ?? 'club_cmu';
const BOARD_SIZE = 32;
const PIXEL_COUNT = BOARD_SIZE * BOARD_SIZE;
const COLORS = new Set([
    '#ffffff', '#222222', '#c41230', '#ffcc00',
    '#22aa66', '#3388ff', '#9955dd', '#ff88bb'
]);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.resolve(__dirname, '..', 'dist');

if (!MONGODB_URI)
{
    throw new Error('MONGODB_URI is required. Add it to .env.local locally or Render environment variables.');
}

const mongoClient = new MongoClient(MONGODB_URI);
await mongoClient.connect();

const boards = mongoClient.db(MONGODB_DB_NAME).collection('whiteboards');
await boards.createIndex({ updatedAt: -1 });

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
            { $set: { pixels: pixelsToSave, updatedAt: new Date() } },
            { upsert: true }
        ));

    try
    {
        await state.persistChain;
        broadcast(state, { type: 'pixel', ...placement });
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
            if (!isBoardId(message.boardId))
            {
                send(socket, { type: 'error', message: 'Invalid board.' });
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
                color: message.color
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

import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIST_DIRECTORY = join(PROJECT_ROOT, 'dist');
const PORT = Number(process.env.PORT || 3001);
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'club_cmu';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

const SIZE = 32;
const PIXEL_COUNT = SIZE * SIZE;
const COLORS = new Set([
    '#ffffff', '#222222', '#c41230', '#ffcc00',
    '#22aa66', '#3388ff', '#9955dd', '#ff88bb'
]);
const BOARD_ID = /^[a-zA-Z0-9_-]{1,64}$/;
const CLIENT_ID = /^[a-zA-Z0-9_-]{8,128}$/;
const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

function emptyPixels() {
    return new Array(PIXEL_COUNT).fill('#ffffff');
}

function isPixelGrid(pixels) {
    return Array.isArray(pixels) &&
        pixels.length === PIXEL_COUNT &&
        pixels.every((color) => COLORS.has(color));
}

function isPlacement(value) {
    return value &&
        Number.isInteger(value.x) && value.x >= 0 && value.x < SIZE &&
        Number.isInteger(value.y) && value.y >= 0 && value.y < SIZE &&
        COLORS.has(value.color);
}

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function apiHeaders() {
    return {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN
    };
}

function sendJson(response, status, body) {
    response.writeHead(status, {
        ...apiHeaders(),
        'Content-Type': 'application/json; charset=utf-8'
    });
    response.end(JSON.stringify(body));
}

async function readRequestJson(request) {
    const chunks = [];
    let totalLength = 0;

    for await (const chunk of request) {
        totalLength += chunk.length;
        if (totalLength > 16 * 1024) {
            throw httpError(413, 'Request body is too large.');
        }
        chunks.push(chunk);
    }

    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
        throw httpError(400, 'Request body must be valid JSON.');
    }
}

function boardResponse(boardId, board) {
    return {
        boardId,
        pixels: isPixelGrid(board?.pixels) ? board.pixels : emptyPixels(),
        updatedAt: board?.updatedAt?.toISOString?.() || null
    };
}

async function registerClient(clients, body) {
    const clientId = body?.clientId || randomUUID();
    const boardId = body?.boardId;

    if (typeof clientId !== 'string' || !CLIENT_ID.test(clientId)) {
        throw httpError(400, 'clientId must contain 8-128 letters, numbers, underscores, or hyphens.');
    }
    if (boardId !== undefined && (typeof boardId !== 'string' || !BOARD_ID.test(boardId))) {
        throw httpError(400, 'boardId must contain only letters, numbers, underscores, or hyphens.');
    }

    const now = new Date();
    const update = {
        $set: { lastSeenAt: now },
        $setOnInsert: { firstSeenAt: now }
    };
    if (boardId) update.$addToSet = { boards: boardId };

    await clients.updateOne({ _id: clientId }, update, { upsert: true });
    const client = await clients.findOne({ _id: clientId });

    return {
        clientId,
        firstSeenAt: client.firstSeenAt.toISOString(),
        lastSeenAt: client.lastSeenAt.toISOString()
    };
}

async function touchClient(clients, clientId, boardId) {
    if (!clientId) return;
    await registerClient(clients, { clientId, boardId });
}

async function createOrLoadBoard(boards, boardId) {
    const now = new Date();
    await boards.updateOne(
        { _id: boardId },
        { $setOnInsert: { pixels: emptyPixels(), createdAt: now, updatedAt: now } },
        { upsert: true }
    );
}

async function handleBoardRequest(request, response, boards, clients, boardId) {
    if (!BOARD_ID.test(boardId)) {
        throw httpError(400, 'Board id must contain only letters, numbers, underscores, or hyphens.');
    }

    if (request.method === 'GET') {
        const board = await boards.findOne({ _id: boardId });
        sendJson(response, 200, boardResponse(boardId, board));
        return;
    }

    if (request.method === 'PUT') {
        const body = await readRequestJson(request);
        if (!isPixelGrid(body?.pixels)) {
            throw httpError(400, `pixels must be an array of ${PIXEL_COUNT} supported colors.`);
        }
        if (body.clientId && (typeof body.clientId !== 'string' || !CLIENT_ID.test(body.clientId))) {
            throw httpError(400, 'clientId must contain 8-128 letters, numbers, underscores, or hyphens.');
        }

        const now = new Date();
        await boards.updateOne(
            { _id: boardId },
            {
                $set: {
                    pixels: body.pixels,
                    updatedAt: now,
                    ...(body.clientId ? { lastModifiedBy: body.clientId } : {})
                },
                $setOnInsert: { createdAt: now }
            },
            { upsert: true }
        );
        await touchClient(clients, body.clientId, boardId);
        sendJson(response, 200, boardResponse(boardId, await boards.findOne({ _id: boardId })));
        return;
    }

    if (request.method === 'POST') {
        const body = await readRequestJson(request);
        if (!isPlacement(body)) {
            throw httpError(400, 'A pixel placement needs valid x, y, and color values.');
        }
        if (body.clientId && (typeof body.clientId !== 'string' || !CLIENT_ID.test(body.clientId))) {
            throw httpError(400, 'clientId must contain 8-128 letters, numbers, underscores, or hyphens.');
        }

        await createOrLoadBoard(boards, boardId);
        const now = new Date();
        await boards.updateOne(
            { _id: boardId },
            {
                $set: {
                    [`pixels.${body.y * SIZE + body.x}`]: body.color,
                    updatedAt: now,
                    ...(body.clientId ? { lastModifiedBy: body.clientId } : {})
                }
            }
        );
        await touchClient(clients, body.clientId, boardId);
        sendJson(response, 200, boardResponse(boardId, await boards.findOne({ _id: boardId })));
        return;
    }

    throw httpError(405, 'Method not allowed.');
}

async function serveStaticFile(response, pathname) {
    const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
    const filePath = resolve(DIST_DIRECTORY, relativePath);
    const isInsideDist = filePath === DIST_DIRECTORY || filePath.startsWith(`${DIST_DIRECTORY}${sep}`);

    if (isInsideDist) {
        try {
            const file = await readFile(filePath);
            response.writeHead(200, {
                'Content-Type': MIME_TYPES[extname(filePath)] || 'application/octet-stream'
            });
            response.end(file);
            return;
        } catch (error) {
            if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error;
        }
    }

    const indexPath = join(DIST_DIRECTORY, 'index.html');
    await stat(indexPath);
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(await readFile(indexPath));
}

async function start() {
    if (!MONGODB_URI) {
        throw new Error('MONGODB_URI is required. See server/README.md for setup instructions.');
    }

    const mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();

    const database = mongoClient.db(MONGODB_DB);
    const boards = database.collection('boards');
    const clients = database.collection('clients');
    await Promise.all([
        boards.createIndex({ updatedAt: -1 }),
        clients.createIndex({ lastSeenAt: -1 })
    ]);

    const server = createServer(async (request, response) => {
        try {
            if (!request.url || !request.method) throw httpError(400, 'Invalid request.');
            const { pathname } = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
            const boardMatch = pathname.match(/^\/api\/boards\/([^/]+)$/);

            if (request.method === 'OPTIONS') {
                response.writeHead(204, apiHeaders());
                response.end();
                return;
            }

            if (pathname === '/api/health') {
                sendJson(response, 200, { status: 'ok', database: MONGODB_DB });
                return;
            }

            if (pathname === '/api/clients/register' && request.method === 'POST') {
                sendJson(response, 201, await registerClient(clients, await readRequestJson(request)));
                return;
            }

            if (boardMatch) {
                await handleBoardRequest(request, response, boards, clients, boardMatch[1]);
                return;
            }

            if (pathname.startsWith('/api/')) throw httpError(404, 'API route not found.');
            await serveStaticFile(response, pathname);
        } catch (error) {
            const status = error.status || 500;
            if (status === 500) console.error(error);
            sendJson(response, status, { error: error.message || 'Internal server error.' });
        }
    });

    const shutdown = async () => {
        server.close();
        await mongoClient.close();
        process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    server.listen(PORT, () => {
        console.log(`Whiteboard server listening on http://localhost:${PORT}`);
    });
}

start().catch((error) => {
    console.error('Unable to start the whiteboard server:', error.message);
    process.exit(1);
});

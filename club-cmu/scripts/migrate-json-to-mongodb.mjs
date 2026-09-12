import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoClient } from 'mongodb';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dataFile = process.env.LEGACY_WHITEBOARD_FILE || resolve(projectRoot, 'data/boards.json');
const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || 'club_cmu';
const colors = new Set([
    '#ffffff', '#222222', '#c41230', '#ffcc00',
    '#22aa66', '#3388ff', '#9955dd', '#ff88bb'
]);

if (!mongoUri) {
    throw new Error('MONGODB_URI is required to migrate boards.');
}

const legacy = JSON.parse(await readFile(dataFile, 'utf8'));
const entries = Object.entries(legacy.boards || {});
const operations = [];

for (const [boardId, board] of entries) {
    const isValidBoard = /^[a-zA-Z0-9_-]{1,64}$/.test(boardId) &&
        Array.isArray(board?.pixels) &&
        board.pixels.length === 1024 &&
        board.pixels.every((color) => colors.has(color));

    if (!isValidBoard) {
        console.warn(`Skipping invalid legacy board: ${boardId}`);
        continue;
    }

    const updatedAt = new Date(board.updatedAt);
    operations.push({
        updateOne: {
            filter: { _id: boardId },
            update: {
                $set: {
                    pixels: board.pixels,
                    updatedAt: Number.isNaN(updatedAt.getTime()) ? new Date() : updatedAt,
                    migratedAt: new Date()
                },
                $setOnInsert: { createdAt: new Date() }
            },
            upsert: true
        }
    });
}

const mongoClient = new MongoClient(mongoUri);
await mongoClient.connect();

try {
    if (operations.length === 0) {
        console.log('No valid legacy boards to migrate.');
    } else {
        const result = await mongoClient.db(databaseName).collection('boards').bulkWrite(operations);
        console.log(`Migrated ${operations.length} board(s): ${result.upsertedCount} created, ${result.modifiedCount} updated.`);
    }
} finally {
    await mongoClient.close();
}

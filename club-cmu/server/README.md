# Shared whiteboard server

The Node service is the only component that communicates with MongoDB. It serves
the built game, exposes a small status API, and keeps open whiteboards in sync
over WebSockets.

MongoDB has two collections:

- `boards`: one 32×32 pixel grid per board, with timestamps.
- `clients`: anonymous browser installations, keyed by a UUID in browser
  storage. It records first/last seen time and boards opened; it is not an
  account system.

## Configuration

Set these values in Render's Environment page, or in an uncommitted
`.env.local` for local development:

```env
MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.example.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=club_cmu
```

`MONGODB_URI` is required. `MONGODB_DB_NAME` defaults to `club_cmu`; the older
`MONGODB_DB` name is also supported for existing deployments.

## Run locally

```sh
npm run dev
```

This starts Vite on `http://localhost:5173` and the Node server on port `3001`.
Vite forwards `/api` and `/ws` to Node. Production uses `npm run build` followed
by `npm start`; Render sets the required `PORT` itself.

## API and WebSocket protocol

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Checks the service can reach MongoDB. |
| `POST` | `/api/clients/register` | Registers `{ clientId, boardId? }`. |
| `GET` | `/api/boards/:boardId` | Returns the current board snapshot. |

Clients connect to `/ws` on the same host, send
`{ "type": "join", "boardId": "the-fence", "clientId": "UUID" }`, then
receive a `snapshot`. A placement is
`{ "type": "place", "boardId": "the-fence", "x": 3, "y": 4, "color": "#c41230" }`.
The server persists it and broadcasts a `pixel` message to every open client.

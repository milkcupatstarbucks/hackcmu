# Whiteboard API and MongoDB

The Node server is the only component that talks to MongoDB. Browsers call the API over HTTPS; the MongoDB connection string and credentials remain on the server.

The database uses two collections:

- `boards`: one document per board, containing its 32×32 pixel array and timestamps.
- `clients`: anonymous browser installations. Each gets a random UUID stored in browser storage, plus `firstSeenAt`, `lastSeenAt`, and the board IDs it opened. This is not an account system or authentication.

## Configure MongoDB

Create a MongoDB database and a database user with access only to this application's database. For MongoDB Atlas, allow only the public IP address of your Oracle server in Atlas Network Access. Do **not** put the MongoDB URI in frontend code.

Use `.env.example` as a reference for the required variables. Configure them in your shell or your Oracle server's secret manager:

```sh
export MONGODB_URI='mongodb+srv://USER:PASSWORD@CLUSTER.example.mongodb.net/?retryWrites=true&w=majority'
export MONGODB_DB='club_cmu'
export ALLOWED_ORIGIN='https://your-app.example.com'
```

`MONGODB_URI` is required. `MONGODB_DB` defaults to `club_cmu`; `ALLOWED_ORIGIN` defaults to `*` for local development only.

If you choose to create a local `.env` file, load it before starting the app:

```sh
set -a; source .env; set +a
```

## Run locally

```sh
npm run dev-full
```

This starts Vite at `http://localhost:8080` and the API at port `3001`; Vite forwards `/api` requests to the API server.

For production, build the game then start the Node server:

```sh
npm run build-nolog
npm start
```

The production server serves both the built game and API on port `3001`.

## Optional migration from the previous JSON store

If `data/boards.json` already contains drawings from the earlier server, import them once after setting `MONGODB_URI`:

```sh
npm run migrate:json-to-mongo
```

The script only reads the JSON file and upserts valid boards into MongoDB; it does not delete the legacy file.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check. |
| `POST` | `/api/clients/register` | Creates or updates an anonymous client: `{ "clientId": "UUID", "boardId": "the-fence" }`. Omit `clientId` to have the server generate one. |
| `GET` | `/api/boards/:boardId` | Fetch a board; an unseen board is returned as blank. |
| `POST` | `/api/boards/:boardId` | Save one pixel: `{ "x": 3, "y": 4, "color": "#c41230", "clientId": "UUID" }`. |
| `PUT` | `/api/boards/:boardId` | Replace a board with `pixels`, an array of 1,024 permitted colors. |

## Docker / Oracle deployment

Build the container, then run it with the MongoDB URI injected by your platform's secret manager or environment configuration:

```sh
docker build -t club-cmu .
docker run -p 3001:3001 \
  -e MONGODB_URI='mongodb+srv://USER:PASSWORD@CLUSTER.example.mongodb.net/?retryWrites=true&w=majority' \
  -e MONGODB_DB='club_cmu' \
  -e ALLOWED_ORIGIN='https://your-app.example.com' \
  club-cmu
```

For a public deployment, use HTTPS in front of the container, restrict MongoDB network access to the server, set a specific `ALLOWED_ORIGIN`, and add application authentication/rate limits before treating client registrations as trustworthy.

# Run the integrated whiteboard

The existing Node server now serves the game, `/ws`, and `/api/organize`. No separate organizer container is needed. The IFM key stays on the server.

## Local test with Docker Desktop

Open Docker Desktop, then use PowerShell:

```powershell
cd C:\Users\brand\hackcmu\club-cmu
docker compose -f compose.local.yaml up --build
```

Open http://localhost:8080/board-test.html in two browser tabs. This dedicated test page bypasses login only in the local demo configuration. The main game remains at http://localhost:8080/.

Draw a stroke and release the mouse, then add text. Both tabs should show the elements. Move the pointer to see the other tab's cursor. Undo removes only your own element. Refresh either tab to load saved elements.

To enable the real organizer, create the ignored `.env.agent` file in this folder with your existing key:

```dotenv
IFM_API_KEY=replace_with_your_key
```

Restart using:

```powershell
docker compose --env-file .env.agent -f compose.local.yaml up --build
```

Add related text notes and press Organize. Both tabs should receive the same categories; reopening the board should restore them. Drawings are saved, but this organizer categorizes text only. If someone edits while IFM is working, retry when the board is quiet. Unchanged boards reuse their saved organization.

Diagnostics and shutdown:

```powershell
docker compose -f compose.local.yaml logs --tail 80 web
docker compose -f compose.local.yaml down
```

MongoDB uses a local named volume, so stopping containers keeps the board. Do not use `down -v` unless you intend to erase local data. Local testing does not connect to your friend's database.

## Teammate / Render setup

Keep the existing Docker deployment rooted at `club-cmu`; its Node server serves everything on one origin. Configure `MONGODB_URI`, `MONGODB_DB_NAME`, `IFM_API_KEY`, `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, and `VITE_AUTH0_AUDIENCE`. The audience must identify your Auth0 API and its tokens must use RS256. The server verifies issuer, audience, signature, and expiration. It reads the same domain/audience variables; optional runtime overrides are `AUTH0_DOMAIN` and `AUTH0_AUDIENCE`.

Auth0 needs the deployed game URL in its allowed callback, logout, and web-origin settings. Rebuild after changing VITE variables because they are embedded into the frontend. Never enable `LOCAL_DEMO` on Render. Keep one server instance until rooms are shared through pub/sub. Push/deploy separately after reviewing the changes.

## Data and integration

- `drawing_boards` stores each board's elements, revision, and organization. The old pixel `boards` collection is preserved; pixel artwork is not converted into strokes.
- Elements have server-assigned author IDs and ISO `createdAt`, `updatedAt`, and `deletedAt` timestamps. Undo is a soft deletion. Current UI supports creation and undo, not editing existing text.
- Cursors are temporary WebSocket messages and are not stored in MongoDB.
- Organization saves group titles and element IDs with `sourceRevision`, `generatedAt`, and model information. Manual category rename/dismiss controls currently affect only that browser.
- The frontend's network adapter replaces local-tab broadcasting. Server-approved edits are saved before they are broadcast.
- Test with `npm test` if Node is installed. These integration tests use an in-memory database substitute and a fake organizer; they do not spend IFM credits.

Before deployment, verify a real Auth0 login, two signed-in users sharing a board, organization with your IFM key, and persistence after restarting the local containers.

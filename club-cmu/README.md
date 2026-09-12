# Phaser Vite TypeScript Template

This is a Phaser project template that uses Vite for bundling. It supports hot-reloading for quick development workflow, includes TypeScript support and scripts to generate production-ready builds.

**[This Template is also available as a JavaScript version.](https://github.com/phaserjs/template-vite)**

### Versions

This template has been updated for:

- [Phaser 4](https://github.com/phaserjs/phaser)
- [Vite 6.3.1](https://github.com/vitejs/vite)
- [TypeScript 5.7.2](https://github.com/microsoft/TypeScript)

![screenshot](screenshot.png)

## Requirements

[Node.js](https://nodejs.org) is required to install dependencies and run scripts via `npm`.

## Available Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install project dependencies |
| `npm run dev` | Launch a development web server |
| `npm run build` | Create a production build in the `dist` folder |
| `npm run dev-nolog` | Launch a development web server without sending anonymous data (see "About log.js" below) |
| `npm run build-nolog` | Create a production build in the `dist` folder without sending anonymous data (see "About log.js" below) |

## Auth0 Login

Players sign in with Google before the game starts. Config comes from environment
variables so each developer keeps their own copy:

```bash
cp .env.example .env.local
```

Fill in `VITE_AUTH0_DOMAIN` and `VITE_AUTH0_CLIENT_ID` from your Auth0 **Single
Page Application**. Until you do, the login screen shows setup instructions
instead of a sign-in button. `.env.local` is gitignored; the domain and client ID
are safe to share with the team and are compiled into the client bundle by
design. A SPA has no client secret - never add one.

### Auth0 dashboard setup

1. Create a **Single Page Application** under Applications.
2. In its Settings, set **Allowed Callback URLs**, **Allowed Logout URLs** and
   **Allowed Web Origins** to your dev server origin. This must match exactly,
   port included - see the note on ports below.
3. Enable the **Google** social connection; leave the others off.
4. Replace Auth0's Google *development keys* with your own Google Cloud OAuth
   client. The dev keys are shared across all Auth0 tenants and rate limited, so
   they are a poor thing to depend on during a demo.

`VITE_AUTH0_AUDIENCE` is optional today and needed once a game server verifies
players: register an API in Auth0 and use its Identifier. Without an audience
Auth0 issues an *opaque* access token a server cannot validate; with one you get
a signed JWT. `getAccessToken()` in `src/auth/auth0.ts` returns that token.

### A note on ports

Auth0 only redirects back to an origin you registered, so the dev server port is
part of the auth config, not a detail. `vite/config.dev.mjs` pins **5173** with
`strictPort: true`: if something already holds 5173 the server fails loudly
instead of quietly moving to 5174 and breaking login with a confusing
"Callback URL mismatch".

Registered in Auth0 today: `http://localhost:5173` (npm dev server),
`http://localhost:8080` and `http://localhost:8081` (Docker). If you serve the
app on any other port or host, register that origin in the Auth0 application
settings first - all three URL fields - or sign-in fails with
"Callback URL mismatch".

### Running under Docker

```bash
docker build -t club-cmu .
docker run --rm --env-file .env.local -p 8081:3000 club-cmu
```

The runtime needs `MONGODB_URI` (and optionally `MONGODB_DB_NAME`) in
`.env.local` so the shared whiteboard can load and save its data.

The catch: **Auth0 config is compiled into the JS bundle at build time**, not
read at `docker run`. Vite only picks up `VITE_*` from `.env` files, not from
the process environment, so `-e VITE_AUTH0_DOMAIN=...` on `docker run` does
nothing. Supply the values at build time instead, either way:

```bash
# Auth0's domain and client ID are public SPA settings, so build args are safe.
docker build \
  --build-arg VITE_AUTH0_DOMAIN=your-tenant.us.auth0.com \
  --build-arg VITE_AUTH0_CLIENT_ID=your-client-id \
  -t club-cmu .
```

With neither, the build still succeeds and the app shows its setup screen rather
than failing at sign-in. Rebuild the image after changing any Auth0 value -
restarting the container is not enough. `.env.local` is excluded from the Docker
build context, so your MongoDB password is never copied into an image layer.

Note that the port you publish (`-p 8081:3000`) is the origin Auth0 sees, not
the container's internal port 3000.

### How it works

`src/main.ts` resolves the Auth0 session *before* Phaser boots, because Universal
Login is a full-page redirect that reloads the app with `?code=&state=` in the
URL. Resolving first means `Preloader` can route to a known state: straight to
`MainMenu` for a signed-in player, or to the `Login` scene otherwise. Doing it
the other way round flashes the login screen on every return trip.

## Shared Whiteboard and Render

The whiteboard is backed by one Node service. It saves boards in MongoDB and
broadcasts each saved pixel to every open browser through a WebSocket. The game
client and server are deliberately served from the same Render URL; no deployed
server URL is hard-coded into the browser code.

### Local development

Add your MongoDB Atlas connection string to your uncommitted `.env.local`:

```env
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@YOUR-CLUSTER.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB_NAME=club_cmu
```

Keep the existing `VITE_AUTH0_*` values in that same file. Then run:

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/ws` and `/api` to the local Node
server on port 3001, so all whiteboard traffic is still same-origin.

### Deploy to Render

1. Push this repository to GitHub, then in Render choose **New → Blueprint** and
   select that repository. The repository-root `render.yaml` creates one Docker
   web service from the `club-cmu` folder.
2. In its environment settings, add `MONGODB_URI` and the three `VITE_AUTH0_*`
   variables. `VITE_AUTH0_AUDIENCE` can be empty until a game server starts
   verifying identities. The `VITE_` values are compiled into the browser bundle
   while Render builds the image, so redeploy after changing any of them.
3. In MongoDB Atlas, allow the Render service to connect and use a database user
   whose permissions are limited to this project's database.
4. Once Render gives you its `https://…onrender.com` URL, add that exact origin
   to Auth0's **Allowed Callback URLs**, **Allowed Logout URLs**, and **Allowed
   Web Origins**, then redeploy.

Render checks `/api/health`; a healthy response confirms both the web service
and MongoDB are reachable. Open the Render URL in two browsers, enter **Open The
Fence**, and change a pixel in one: it should appear in the other immediately.
The Blueprint deliberately runs one web-service instance, because WebSocket
broadcasts live in that process; add a shared pub/sub layer before scaling it.

## Writing Code

After cloning the repo, run `npm install` from your project directory. Then, you can start the local development server by running `npm run dev`.

The local development server runs on `http://localhost:8080` by default. Please see the Vite documentation if you wish to change this, or add SSL support.

Once the server is running you can edit any of the files in the `src` folder. Vite will automatically recompile your code and then reload the browser.

## Template Project Structure

We have provided a default project structure to get you started. This is as follows:

## Template Project Structure

We have provided a default project structure to get you started:

| Path                         | Description                                                |
|------------------------------|------------------------------------------------------------|
| `index.html`                 | A basic HTML page to contain the game.                     |
| `public/assets`              | Game sprites, audio, etc. Served directly at runtime.      |
| `public/style.css`           | Global layout styles.                                      |
| `src/main.ts`                | Application bootstrap.                                     |
| `src/game`                   | Folder containing the game code.                           |
| `src/game/main.ts`           | Game entry point: configures and starts the game.          |
| `src/game/scenes`            | Folder with all Phaser game scenes.                        | 


## Handling Assets

Vite supports loading assets via JavaScript module `import` statements.

This template provides support for both embedding assets and also loading them from a static folder. To embed an asset, you can import it at the top of the JavaScript file you are using it in:

```js
import logoImg from './assets/logo.png'
```

To load static files such as audio files, videos, etc place them into the `public/assets` folder. Then you can use this path in the Loader calls within Phaser:

```js
preload ()
{
    //  This is an example of an imported bundled image.
    //  Remember to import it at the top of this file
    this.load.image('logo', logoImg);

    //  This is an example of loading a static image
    //  from the public/assets folder:
    this.load.image('background', 'assets/bg.png');
}
```

When you issue the `npm run build` command, all static assets are automatically copied to the `dist/assets` folder.

## Deploying to Production

After you run the `npm run build` command, your code will be built into a single bundle and saved to the `dist` folder, along with any other assets your project imported, or stored in the public assets folder.

In order to deploy your game, you will need to upload *all* of the contents of the `dist` folder to a public facing web server.

## Customizing the Template

### Vite

If you want to customize your build, such as adding plugin (i.e. for loading CSS or fonts), you can modify the `vite/config.*.mjs` file for cross-project changes, or you can modify and/or create new configuration files and target them in specific npm tasks inside of `package.json`. Please see the [Vite documentation](https://vitejs.dev/) for more information.

## About log.js

If you inspect our node scripts you will see there is a file called `log.js`. This file makes a single silent API call to a domain called `gryzor.co`. This domain is owned by Phaser Studio Inc. The domain name is a homage to one of our favorite retro games.

We send the following 3 pieces of data to this API: The name of the template being used (vue, react, etc). If the build was 'dev' or 'prod' and finally the version of Phaser being used.

At no point is any personal data collected or sent. We don't know about your project files, device, browser or anything else. Feel free to inspect the `log.js` file to confirm this.

Why do we do this? Because being open source means we have no visible metrics about which of our templates are being used. We work hard to maintain a large and diverse set of templates for Phaser developers and this is our small anonymous way to determine if that work is actually paying off, or not. In short, it helps us ensure we're building the tools for you.

However, if you don't want to send any data, you can use these commands instead:

Dev:

```bash
npm run dev-nolog
```

Build:

```bash
npm run build-nolog
```

Or, to disable the log entirely, simply delete the file `log.js` and remove the call to it in the `scripts` section of `package.json`:

Before:

```json
"scripts": {
    "dev": "node log.js dev & dev-template-script",
    "build": "node log.js build & build-template-script"
},
```

After:

```json
"scripts": {
    "dev": "dev-template-script",
    "build": "build-template-script"
},
```

Either of these will stop `log.js` from running. If you do decide to do this, please could you at least join our Discord and tell us which template you're using! Or send us a quick email. Either will be super-helpful, thank you.

## Join the Phaser Community!

We love to see what developers like you create with Phaser! It really motivates us to keep improving. So please join our community and show-off your work 😄

**Visit:** The [Phaser website](https://phaser.io) and follow on [Phaser Twitter](https://twitter.com/phaser_)<br />
**Play:** Some of the amazing games [#madewithphaser](https://twitter.com/search?q=%23madewithphaser&src=typed_query&f=live)<br />
**Learn:** [API Docs](https://newdocs.phaser.io), [Support Forum](https://phaser.discourse.group/) and [StackOverflow](https://stackoverflow.com/questions/tagged/phaser-framework)<br />
**Discord:** Join us on [Discord](https://discord.gg/phaser)<br />
**Code:** 2000+ [Examples](https://labs.phaser.io)<br />
**Read:** The [Phaser World](https://phaser.io/community/newsletter) Newsletter<br />

Created by [Phaser Studio](mailto:support@phaser.io). Powered by coffee, anime, pixels and love.

The Phaser logo and characters are &copy; 2011 - 2025 Phaser Studio Inc.

All rights reserved.

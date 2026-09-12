import { createAuth0Client, type Auth0Client, type User } from '@auth0/auth0-spa-js';

const domain = import.meta.env.VITE_AUTH0_DOMAIN ?? '';
const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID ?? '';
const audience = import.meta.env.VITE_AUTH0_AUDIENCE ?? '';

//  Google is the only connection we enable, so we name it explicitly and send
//  players straight to the Google account picker. Without this, Auth0 shows its
//  own connection-chooser screen first, which is a pointless extra click.
const CONNECTION = 'google-oauth2';

let client: Auth0Client | null = null;
let user: User | null = null;
let authError: string | null = null;

//  True once someone has filled in .env.local. Lets the Login scene show setup
//  instructions instead of failing against an empty Auth0 domain.
export const isAuthConfigured = () => domain !== '' && clientId !== '';

export const getUser = () => user;
export const isLoggedIn = () => user !== null;
export const getAuthError = () => authError;

//  Strip ?code=&state= (or ?error=) so a refresh doesn't retry a spent callback.
const clearQueryString = () => {

    window.history.replaceState({}, document.title, window.location.pathname);

};

//  Must finish before Phaser boots - see the comment in src/main.ts.
export async function initAuth (): Promise<void>
{
    if (!isAuthConfigured())
    {
        return;
    }

    try
    {
        client = await createAuth0Client({
            domain,
            clientId,
            //  localstorage + refresh tokens keeps the session across reloads.
            //  With the default in-memory cache, browsers that block third-party
            //  cookies (Safari, and Chrome increasingly) fail silent auth and
            //  bounce the player back to the login screen on every refresh.
            cacheLocation: 'localstorage',
            useRefreshTokens: true,
            authorizationParams: {
                redirect_uri: window.location.origin,
                scope: 'openid profile email',
                ...(audience !== '' ? { audience } : {})
            }
        });

        const params = new URLSearchParams(window.location.search);

        if (params.has('error'))
        {
            authError = params.get('error_description') ?? params.get('error');

            clearQueryString();
        }
        else if (params.has('code') && params.has('state'))
        {
            await client.handleRedirectCallback();

            clearQueryString();
        }

        if (await client.isAuthenticated())
        {
            user = await client.getUser() ?? null;
        }
    }
    catch (err)
    {
        authError = err instanceof Error ? err.message : String(err);
    }
}

export async function login (): Promise<void>
{
    if (client === null)
    {
        return;
    }

    await client.loginWithRedirect({
        authorizationParams: { connection: CONNECTION }
    });
}

export async function logout (): Promise<void>
{
    if (client === null)
    {
        return;
    }

    await client.logout({
        logoutParams: { returnTo: window.location.origin }
    });
}

/**
 * The token a game server would verify before trusting a socket connection.
 *
 * Returns null unless VITE_AUTH0_AUDIENCE is set, because without an audience
 * Auth0 issues an opaque access token that a server cannot validate on its own.
 */
export async function getAccessToken (): Promise<string | null>
{
    if (client === null || audience === '')
    {
        return null;
    }

    try
    {
        return await client.getTokenSilently();
    }
    catch
    {
        return null;
    }
}

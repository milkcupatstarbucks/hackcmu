import StartGame from './game/main';
import { initAuth } from './auth/auth0';

document.addEventListener('DOMContentLoaded', async () => {

    //  Resolve the Auth0 session *before* Phaser boots.
    //
    //  Auth0's Universal Login is a full-page redirect, so the browser comes back
    //  here with ?code=&state= and the page reloads from scratch. If the game
    //  started first it would show the Login scene, then discover a second later
    //  that we're already signed in and jump away - a visible flash on every
    //  return trip. Awaiting here means Preloader can route to a known state.
    await initAuth();

    StartGame('game-container');

});

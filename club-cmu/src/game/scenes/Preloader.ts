import { Scene } from 'phaser';
import { isLoggedIn } from '../../auth/auth0';
import { createScottyAnimations, loadScottySheet } from '../campus/scotty';
import { addTitleBackdrop } from '../ui/title';

export class Preloader extends Scene
{
    constructor ()
    {
        super('Preloader');
    }

    init ()
    {
        addTitleBackdrop(this);

        //  A simple progress bar. This is the outline of the bar.
        this.add.rectangle(512, 384, 468, 32).setStrokeStyle(1, 0xffffff);

        //  This is the progress bar itself. It will increase in size from the left based on the % of progress.
        const bar = this.add.rectangle(512-230, 384, 4, 28, 0xffffff);

        //  Use the 'progress' event emitted by the LoaderPlugin to update the loading bar
        this.load.on('progress', (progress: number) => {

            //  Update the progress bar (our bar is 464px wide, so 100% = 464px)
            bar.width = 4 + (460 * progress);

        });
    }

    preload ()
    {
        //  Load the assets for the game - Replace with your own assets
        this.load.setPath('assets');

        this.load.svg('google-mark', 'google-mark.svg', { width: 36, height: 36 });
        loadScottySheet(this);
    }

    create ()
    {
        //  Animations are global, so every scene can use the Scotty walk cycles.
        createScottyAnimations(this);

        //  Auth0 has already been resolved by this point (see src/main.ts), so we
        //  can skip the Login scene outright when this browser has a live session.
        this.scene.start(isLoggedIn() ? 'MainMenu' : 'Login');
    }
}

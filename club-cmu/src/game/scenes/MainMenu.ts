import { Scene } from 'phaser';
import { getUser, logout } from '../../auth/auth0';
import { addFenceLogo, addMenuButton, addTitleBackdrop } from '../ui/title';

export class MainMenu extends Scene
{
    constructor ()
    {
        super('MainMenu');
    }

    create ()
    {
        addTitleBackdrop(this);
        addFenceLogo(this, 512, 250);

        const user = getUser();
        const name = user?.given_name ?? user?.name ?? user?.email;

        this.add.text(512, 450, name ? `Welcome back, ${name}!` : 'Welcome to campus!', {
            fontFamily: 'Arial Black', fontSize: 30, color: '#ffffff',
            stroke: '#1a0409', strokeThickness: 6,
            align: 'center'
        }).setOrigin(0.5);

        addMenuButton(this, 512, 540, 'Play', () => this.scene.start('Game'));

        if (user !== null)
        {
            this.createLogoutLink(512, 630);
        }
    }

    //  A quiet text link, so it can't be mistaken for the main action. It is
    //  its own interactive object rather than a scene-wide pointerdown
    //  listener, which would also have fired when clicking Play.
    private createLogoutLink (x: number, y: number)
    {
        const link = this.add.text(x, y, 'Log out', {
            fontFamily: 'Arial', fontSize: 20, color: '#ffffff',
            stroke: '#1a0409', strokeThickness: 4
        }).setOrigin(0.5).setAlpha(0.85).setInteractive({ useHandCursor: true });

        link.on('pointerover', () => link.setAlpha(1).setColor('#ffd6dc'));
        link.on('pointerout', () => link.setAlpha(0.85).setColor('#ffffff'));
        link.once('pointerdown', () => logout());
    }
}

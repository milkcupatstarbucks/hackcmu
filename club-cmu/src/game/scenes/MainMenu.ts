import { Scene, GameObjects } from 'phaser';
import { getUser, logout } from '../../auth/auth0';

export class MainMenu extends Scene
{
    background: GameObjects.Image;
    logo: GameObjects.Image;
    title: GameObjects.Text;

    constructor ()
    {
        super('MainMenu');
    }

    create ()
    {
        this.background = this.add.image(512, 384, 'background');

        this.logo = this.add.image(512, 300, 'logo');

        this.title = this.add.text(512, 460, 'Main Menu', {
            fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        }).setOrigin(0.5);

        const user = getUser();

        if (user !== null)
        {
            this.add.text(512, 516, `Signed in as ${user.name ?? user.email ?? 'player'}`, {
                fontFamily: 'Arial', fontSize: 18, color: '#ffffff',
                stroke: '#000000', strokeThickness: 4,
                align: 'center'
            }).setOrigin(0.5);
        }

        //  An explicit Play button rather than the template's scene-wide
        //  pointerdown listener: that fired on *any* click, so clicking 'Log out'
        //  would have started the game at the same time.
        this.createTextButton(512, 580, 'Play', () => this.scene.start('Game'));

        if (user !== null)
        {
            this.createTextButton(512, 644, 'Log out', () => logout());
        }
    }

    private createTextButton (x: number, y: number, text: string, onClick: () => void)
    {
        const button = this.add.text(x, y, text, {
            fontFamily: 'Arial Black', fontSize: 28, color: '#ffffff',
            stroke: '#000000', strokeThickness: 6,
            align: 'center'
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        button.on('pointerover', () => button.setColor('#ffdd57'));
        button.on('pointerout', () => button.setColor('#ffffff'));
        button.once('pointerdown', onClick);
    }
}

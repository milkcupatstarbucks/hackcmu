import { Geom, Scene } from 'phaser';
import { getAuthError, isAuthConfigured, login } from '../../auth/auth0';
import { addFenceLogo, addTitleBackdrop } from '../ui/title';

export class Login extends Scene
{
    constructor ()
    {
        super('Login');
    }

    create ()
    {
        addTitleBackdrop(this);
        addFenceLogo(this, 512, 270);

        if (isAuthConfigured())
        {
            this.add.text(512, 480, 'Sign in to join your classmates on campus', {
                fontFamily: 'Arial', fontSize: 20, color: '#ffffff',
                stroke: '#1a0409', strokeThickness: 4,
                align: 'center'
            }).setOrigin(0.5);

            this.createGoogleButton(512, 550);
        }
        else
        {
            this.showSetupNotice(512, 560);
        }

        this.addFooter();

        const error = getAuthError();

        if (error !== null)
        {
            this.add.text(512, 650, `Sign-in failed: ${error}`, {
                fontFamily: 'Arial', fontSize: 16, color: '#ff8a80',
                stroke: '#000000', strokeThickness: 3,
                align: 'center', wordWrap: { width: 720 }
            }).setOrigin(0.5);
        }
    }

    //  A canvas can't host a real text input, which normally makes an in-game
    //  login screen awkward. Because Google is our only connection, all credential
    //  entry happens on Google's own page - so this scene only needs one button.
    private createGoogleButton (x: number, y: number)
    {
        const width = 340;
        const height = 64;
        const radius = 12;

        const button = this.add.container(x, y);

        //  Drawn with Graphics rather than `add.rectangle().setRounded()`, because
        //  a filled rounded Rectangle throws in Phaser 4.0.0: its WebGL renderer
        //  still calls a leftover v3 code path that references an undefined
        //  `pipeline`. Graphics' rounded-rect path is unaffected.
        const bg = this.add.graphics();

        const draw = (fillColor: number) => {

            bg.clear();
            bg.fillStyle(fillColor, 1);
            bg.fillRoundedRect(-width / 2, -height / 2, width, height, radius);
            bg.lineStyle(2, 0xdadce0, 1);
            bg.strokeRoundedRect(-width / 2, -height / 2, width, height, radius);

        };

        draw(0xffffff);

        const icon = this.add.image(-108, 0, 'google-mark');

        const label = this.add.text(-74, 0, 'Sign in with Google', {
            fontFamily: 'Arial', fontSize: 22, color: '#3c4043'
        }).setOrigin(0, 0.5);

        button.add([ bg, icon, label ]);

        bg.setInteractive({
            hitArea: new Geom.Rectangle(-width / 2, -height / 2, width, height),
            hitAreaCallback: Geom.Rectangle.Contains,
            useHandCursor: true
        });

        bg.on('pointerover', () => {

            draw(0xf1f3f4);

            this.tweens.add({ targets: button, scale: 1.04, duration: 120, ease: 'Quad.easeOut' });

        });

        bg.on('pointerout', () => {

            draw(0xffffff);

            this.tweens.add({ targets: button, scale: 1, duration: 120, ease: 'Quad.easeOut' });

        });

        //  `once`, so an impatient double-click can't fire two redirects.
        bg.once('pointerdown', () => {

            bg.disableInteractive();
            label.setText('Redirecting...');

            login();

        });
    }

    private addFooter ()
    {
        this.add.text(512, 740, 'Made for Carnegie Mellon students at HackCMU', {
            fontFamily: 'Arial', fontSize: 14, color: '#ffffff'
        }).setOrigin(0.5).setAlpha(0.7);
    }

    private showSetupNotice (x: number, y: number)
    {
        this.add.text(x, y, 'Auth0 isn\'t configured yet.\n\nRun  cp .env.example .env.local\nthen fill in your Auth0 domain and client ID.', {
            fontFamily: 'Arial', fontSize: 20, color: '#ffdd57',
            stroke: '#000000', strokeThickness: 4,
            align: 'center'
        }).setOrigin(0.5);
    }
}

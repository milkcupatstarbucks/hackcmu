import { Scene } from 'phaser';
declare global {
    interface Window {
        Whiteboard: {
            isOpen: boolean;
            open(boardId: string): void;
            close(): void;
        };
    }
}

export class Game extends Scene
{
    camera: Phaser.Cameras.Scene2D.Camera;
    background: Phaser.GameObjects.Image;
    msg_text : Phaser.GameObjects.Text;

    constructor ()
    {
        super('Game');
    }

    create ()
    {
        this.camera = this.cameras.main;
        this.camera.setBackgroundColor(0x00ff00);

        this.background = this.add.image(512, 384, 'background');
        this.background.setAlpha(0.5);

        this.msg_text = this.add.text(512, 384, 'Make something fun!\nand share it with us:\nsupport@phaser.io', {
            fontFamily: 'Arial Black', fontSize: 38, color: '#ffffff',
            stroke: '#000000', strokeThickness: 8,
            align: 'center'
        });
        this.msg_text.setOrigin(0.5);

        // this.input.once('pointerdown', () => {

        //     this.scene.start('GameOver');

        // });
        this.add.text(40, 40, 'Open The Fence', {
            fontFamily: 'Arial',
            fontSize: 24,
            color: '#ffffff',
            backgroundColor: '#c41230',
            padding: { x: 16, y: 12 }
        })
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
            window.Whiteboard.open('the-fence');
        });
    }
}

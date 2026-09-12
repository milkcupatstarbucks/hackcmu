import { GameObjects, Geom, Input, Math as PhaserMath, Physics, Scene, Types } from 'phaser';
import { drawCampusMap, FENCE, FENCE_ZONE, SPAWN, WORLD } from '../campus/map';
import { FRAME, IDLE_FRAME, LOOKS, SCOTTY_KEY, SCOTTY_SCALE, walkAnimation, type Facing } from '../campus/scotty';
import { CampusConnection, type Movement, type PlayerState } from '../net/CampusConnection';

declare global {
    interface Window {
        Whiteboard?: {
            isOpen: boolean;
            open(boardId: string): void;
            close(): void;
        };
    }
}

const FENCE_BOARD_ID = 'the-fence';
const WALK_SPEED = 220;
const HUD_DEPTH = 100000;

interface Avatar
{
    sprite: GameObjects.Sprite;
    label: GameObjects.Text;
    target: { x: number, y: number };
    facing: Facing;
    moving: boolean;
    pose: string;
}

export class Campus extends Scene
{
    private connection!: CampusConnection;
    private obstacles!: Physics.Arcade.StaticGroup;

    private me: Avatar | null = null;
    private body: Physics.Arcade.Body | null = null;
    private others = new Map<string, Avatar>();

    private cursors!: Types.Input.Keyboard.CursorKeys;
    private wasd!: Record<'W' | 'A' | 'S' | 'D', Input.Keyboard.Key>;
    private paintKeys!: Input.Keyboard.Key[];
    private walkTarget: PhaserMath.Vector2 | null = null;
    private stuckCheck = { x: 0, y: 0, at: 0 };

    private inFenceZone = false;
    private keyboardCaptured = true;

    private onlineText!: GameObjects.Text;
    private youText!: GameObjects.Text;
    private statusText!: GameObjects.Text;
    private fenceHint!: GameObjects.Text;

    constructor ()
    {
        super('Campus');
    }

    create ()
    {
        this.others.clear();
        this.me = null;
        this.body = null;
        this.inFenceZone = false;
        this.keyboardCaptured = true;

        this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
        this.obstacles = this.physics.add.staticGroup();

        for (const box of drawCampusMap(this))
        {
            const zone = this.add.zone(box.x + box.width / 2, box.y + box.height / 2, box.width, box.height);
            this.physics.add.existing(zone, true);
            this.obstacles.add(zone);
        }

        this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
        this.cameras.main.centerOn(SPAWN.x, SPAWN.y + 150);

        this.createFenceHint();
        this.createHud();
        this.createInput();

        this.connection = new CampusConnection({
            welcome: (you, players) => this.onWelcome(you, players),
            joined: (player) => this.addOther(player),
            moved: (id, movement) => this.moveOther(id, movement),
            left: (id) => this.removeOther(id),
            replaced: () => this.leaveCampus('You logged on to campus in another tab.'),
            status: (message) => this.setStatus(message)
        });

        this.setStatus('Logging on to campus...');
        this.connection.logOn();

        //  Leaving the scene any way at all logs the player off, so nobody is
        //  left standing on campus after they go.
        const logOff = () => this.connection.logOff();
        window.addEventListener('pagehide', logOff);

        this.events.once('shutdown', () => {

            window.removeEventListener('pagehide', logOff);
            logOff();
            this.setKeyboardCapture(true);

        });
    }

    update (_time: number, delta: number)
    {
        const smoothing = Math.min(1, delta / 1000 * 12);

        for (const avatar of this.others.values())
        {
            avatar.sprite.x += (avatar.target.x - avatar.sprite.x) * smoothing;
            avatar.sprite.y += (avatar.target.y - avatar.sprite.y) * smoothing;
            this.placeAvatar(avatar);
        }

        if (this.me === null || this.body === null)
        {
            return;
        }

        const boardOpen = window.Whiteboard?.isOpen === true;

        //  While painting, the keyboard belongs to the board's controls.
        this.setKeyboardCapture(!boardOpen);

        const velocity = boardOpen ? new PhaserMath.Vector2() : this.readVelocity();

        this.body.setVelocity(velocity.x, velocity.y);

        const moving = velocity.lengthSq() > 0;

        if (velocity.x !== 0)
        {
            this.me.facing = velocity.x < 0 ? 'left' : 'right';
        }

        this.me.moving = moving;
        this.placeAvatar(this.me);

        this.checkFence(boardOpen);

        this.connection.setMovement({ x: this.me.sprite.x, y: this.me.sprite.y, facing: this.me.facing, moving });
        this.connection.flush();
    }

    private readVelocity ()
    {
        const direction = new PhaserMath.Vector2(
            Number(this.cursors.right.isDown || this.wasd.D.isDown) - Number(this.cursors.left.isDown || this.wasd.A.isDown),
            Number(this.cursors.down.isDown || this.wasd.S.isDown) - Number(this.cursors.up.isDown || this.wasd.W.isDown)
        );

        if (direction.lengthSq() > 0)
        {
            this.walkTarget = null;
        }
        else if (this.walkTarget !== null && this.me !== null)
        {
            const { x, y } = this.me.sprite;

            direction.set(this.walkTarget.x - x, this.walkTarget.y - y);

            //  Arrived, or walked into a wall and stopped making progress.
            if (direction.length() < 6)
            {
                this.walkTarget = null;
                direction.reset();
            }
            else if (this.time.now - this.stuckCheck.at > 300)
            {
                if (PhaserMath.Distance.Between(x, y, this.stuckCheck.x, this.stuckCheck.y) < 8)
                {
                    this.walkTarget = null;
                    direction.reset();
                }

                this.stuckCheck = { x, y, at: this.time.now };
            }
        }

        return direction.normalize().scale(WALK_SPEED);
    }

    private checkFence (boardOpen: boolean)
    {
        const { x, y } = this.me!.sprite;
        const inside = Geom.Rectangle.Contains(
            new Geom.Rectangle(FENCE_ZONE.x, FENCE_ZONE.y, FENCE_ZONE.width, FENCE_ZONE.height), x, y
        );

        //  Open the board on arrival only. After closing it, the player can
        //  walk away and back, or press E / Space while still at the Fence.
        const reopen = inside && !boardOpen && this.paintKeys.some((key) => Input.Keyboard.JustDown(key));

        if ((inside && !this.inFenceZone && !boardOpen) || reopen)
        {
            this.walkTarget = null;
            this.body!.setVelocity(0, 0);
            window.Whiteboard?.open(FENCE_BOARD_ID);
        }

        this.inFenceZone = inside;
        this.fenceHint.setText(inside ? 'Press E to paint' : 'Walk up to paint!');
        this.fenceHint.setVisible(!boardOpen);
    }

    private onWelcome (you: PlayerState, players: PlayerState[])
    {
        for (const id of [ ...this.others.keys() ])
        {
            this.removeOther(id);
        }

        players.forEach((player) => this.addOther(player));

        //  A reconnect keeps the existing avatar where the player already is.
        if (this.me === null)
        {
            const sprite = this.physics.add.sprite(you.x, you.y, SCOTTY_KEY, IDLE_FRAME.right);

            this.me = this.createAvatar(sprite, you, true);
            this.body = sprite.body as Physics.Arcade.Body;

            //  Collide at the paws only, so the dog can stand in front of things.
            this.body.setSize(80, 28).setOffset((FRAME.width - 80) / 2, FRAME.height - 32);
            this.body.setCollideWorldBounds(true);
            this.physics.add.collider(sprite, this.obstacles);

            this.cameras.main.startFollow(sprite, true, 0.15, 0.15);
        }

        this.youText.setText(`You: ${you.name} - ${LOOKS[you.look]?.name ?? 'Classic'} Scotty`);
        this.updateOnline();
    }

    private createAvatar (sprite: GameObjects.Sprite, state: PlayerState, isMe: boolean): Avatar
    {
        sprite.setOrigin(0.5, 1).setScale(SCOTTY_SCALE).setTint(LOOKS[state.look]?.tint ?? 0xffffff);

        const label = this.add.text(state.x, state.y, isMe ? `${state.name} (you)` : state.name, {
            fontFamily: 'Arial', fontSize: 14, color: isMe ? '#ffe07a' : '#ffffff',
            stroke: '#1a0409', strokeThickness: 4
        }).setOrigin(0.5, 1);

        const avatar: Avatar = {
            sprite, label, target: { x: state.x, y: state.y }, facing: state.facing, moving: state.moving, pose: ''
        };

        this.placeAvatar(avatar);

        return avatar;
    }

    //  Pose, draw order and name tag for one avatar. Depth follows the feet, so
    //  a dog further down the screen is drawn in front of one further up.
    private placeAvatar (avatar: Avatar)
    {
        const pose = avatar.moving ? walkAnimation(avatar.facing) : `idle-${avatar.facing}`;

        if (pose !== avatar.pose)
        {
            avatar.pose = pose;

            if (avatar.moving)
            {
                avatar.sprite.play(pose);
            }
            else
            {
                avatar.sprite.stop();
                avatar.sprite.setFrame(IDLE_FRAME[avatar.facing]);
            }
        }

        avatar.sprite.setDepth(avatar.sprite.y);
        avatar.label.setPosition(avatar.sprite.x, avatar.sprite.y - FRAME.height * SCOTTY_SCALE - 2);
        avatar.label.setDepth(HUD_DEPTH - 1);
    }

    private addOther (player: PlayerState)
    {
        this.removeOther(player.id);
        this.others.set(player.id, this.createAvatar(this.add.sprite(player.x, player.y, SCOTTY_KEY), player, false));
        this.updateOnline();
    }

    private moveOther (id: string, movement: Movement)
    {
        const avatar = this.others.get(id);

        if (avatar)
        {
            avatar.target = { x: movement.x, y: movement.y };
            avatar.facing = movement.facing;
            avatar.moving = movement.moving;
        }
    }

    private removeOther (id: string)
    {
        const avatar = this.others.get(id);

        if (avatar)
        {
            avatar.sprite.destroy();
            avatar.label.destroy();
            this.others.delete(id);
            this.updateOnline();
        }
    }

    private leaveCampus (message?: string)
    {
        this.connection.logOff();

        if (window.Whiteboard?.isOpen)
        {
            window.Whiteboard.close();
        }

        if (message)
        {
            this.setStatus(message);
            this.time.delayedCall(2500, () => this.scene.start('MainMenu'));
        }
        else
        {
            this.scene.start('MainMenu');
        }
    }

    private createInput ()
    {
        const keyboard = this.input.keyboard!;

        this.cursors = keyboard.createCursorKeys();
        this.wasd = keyboard.addKeys('W,A,S,D') as Campus['wasd'];
        this.paintKeys = [ keyboard.addKey('E'), keyboard.addKey('SPACE') ];

        //  Club Penguin style: click anywhere on campus to walk there.
        this.input.on('pointerdown', (pointer: Input.Pointer, over: GameObjects.GameObject[]) => {

            if (over.length > 0 || this.me === null || window.Whiteboard?.isOpen)
            {
                return;
            }

            this.walkTarget = new PhaserMath.Vector2(pointer.worldX, pointer.worldY);
            this.stuckCheck = { x: this.me.sprite.x, y: this.me.sprite.y, at: this.time.now };

        });
    }

    private setKeyboardCapture (capture: boolean)
    {
        if (capture === this.keyboardCaptured)
        {
            return;
        }

        this.keyboardCaptured = capture;

        if (capture)
        {
            this.input.keyboard!.enableGlobalCapture();
        }
        else
        {
            this.input.keyboard!.disableGlobalCapture();
            this.input.keyboard!.resetKeys();
        }
    }

    private createFenceHint ()
    {
        this.fenceHint = this.add.text(FENCE.x + FENCE.width / 2, FENCE.y - 52, 'Walk up to paint!', {
            fontFamily: 'Arial', fontSize: 16, color: '#1a0409', backgroundColor: '#ffe07a',
            padding: { x: 10, y: 5 }
        }).setOrigin(0.5).setDepth(HUD_DEPTH - 2);

        this.tweens.add({ targets: this.fenceHint, y: FENCE.y - 60, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    private createHud ()
    {
        const hudText = (x: number, y: number, size: number) => this.add.text(x, y, '', {
            fontFamily: 'Arial', fontSize: size, color: '#ffffff',
            stroke: '#1a0409', strokeThickness: 4
        }).setScrollFactor(0).setDepth(HUD_DEPTH);

        this.onlineText = hudText(20, 16, 20);
        this.youText = hudText(20, 44, 16);
        this.updateOnline();

        hudText(512, 744, 16)
            .setOrigin(0.5, 1)
            .setText('WASD / arrow keys or click to walk  |  Walk up to the Fence to paint');

        this.statusText = this.add.text(512, 120, '', {
            fontFamily: 'Arial', fontSize: 20, color: '#ffffff', backgroundColor: '#1a0409cc',
            padding: { x: 16, y: 10 }, align: 'center'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(HUD_DEPTH).setVisible(false);

        const logOff = this.add.text(1004, 16, 'Log off', {
            fontFamily: 'Arial Black', fontSize: 18, color: '#ffffff', backgroundColor: '#c41230',
            padding: { x: 14, y: 8 }
        }).setOrigin(1, 0).setScrollFactor(0).setDepth(HUD_DEPTH).setInteractive({ useHandCursor: true });

        logOff.on('pointerover', () => logOff.setBackgroundColor('#8f0d23'));
        logOff.on('pointerout', () => logOff.setBackgroundColor('#c41230'));
        logOff.once('pointerdown', () => this.leaveCampus());
    }

    private updateOnline ()
    {
        const count = this.others.size + (this.me ? 1 : 0);

        this.onlineText?.setText(count === 1 ? '1 student on campus' : `${count} students on campus`);
    }

    private setStatus (message: string | null)
    {
        this.statusText.setText(message ?? '').setVisible(message !== null);
    }
}

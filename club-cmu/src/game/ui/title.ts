import { GameObjects, Geom, Scene } from 'phaser';

export const CARNEGIE_RED = 0xc41230;

const TARTAN_KEY = 'cmu-tartan';
const TARTAN_TILE = 128;
const CHARCOAL = 0x1d1d22;
const FENCE_PAINT = 0xefe8da;
const FENCE_OUTLINE = 0x3b2e24;

//  A tartan tile in Carnegie red. Each band is drawn translucent in both
//  directions, so the crossings come out darker the way a woven plaid does.
function createTartanTexture (scene: Scene)
{
    if (scene.textures.exists(TARTAN_KEY))
    {
        return;
    }

    const size = TARTAN_TILE;
    const g = scene.make.graphics({}, false);

    g.fillStyle(CARNEGIE_RED, 1);
    g.fillRect(0, 0, size, size);

    const bands: [ offset: number, width: number, color: number, alpha: number ][] = [
        [ 0, 14, 0x6d0a1c, 0.55 ],
        [ 38, 34, CHARCOAL, 0.5 ],
        [ 54, 2, 0xffffff, 0.35 ],
        [ 98, 14, 0x6d0a1c, 0.55 ],
        [ 118, 2, 0x9a9aa0, 0.45 ]
    ];

    for (const [ offset, width, color, alpha ] of bands)
    {
        g.fillStyle(color, alpha);
        g.fillRect(0, offset, size, width);
        g.fillRect(offset, 0, width, size);
    }

    g.generateTexture(TARTAN_KEY, size, size);
    g.destroy();
}

//  Full-screen tartan with a dark wash, so white text stays readable on it.
export function addTitleBackdrop (scene: Scene)
{
    createTartanTexture(scene);

    const { width, height } = scene.scale;

    scene.add.tileSprite(0, 0, width, height, TARTAN_KEY).setOrigin(0);
    scene.add.rectangle(0, 0, width, height, 0x1a0409, 0.45).setOrigin(0);
}

//  The game's logo: "Club CMU" painted across a small Fence, the same
//  posts-and-two-rails shape as the shared painting board.
export function addFenceLogo (scene: Scene, x: number, y: number)
{
    const logo = scene.add.container(x, y);

    const postWidth = 48;
    const bayWidth = 156;
    const left = -(postWidth * 4 + bayWidth * 3) / 2;

    const posts = [ 0, 1, 2, 3 ].map((i) => new Geom.Rectangle(
        left + i * (postWidth + bayWidth), -150, postWidth, 290
    ));

    const rails = [
        new Geom.Rectangle(left, -100, -left * 2, 110),
        new Geom.Rectangle(left, 40, -left * 2, 70)
    ];

    const parts = [ ...posts, ...rails ];
    const radius = (part: Geom.Rectangle) => part.width === postWidth ? 18 : 14;

    //  Filled rounded rects rather than strokes: Graphics has no union, so an
    //  outline is an enlarged dark silhouette with the paint filled on top.
    const g = scene.add.graphics();

    g.fillStyle(0x000000, 0.3);
    parts.forEach((part) => g.fillRoundedRect(part.x + 8, part.y + 10, part.width, part.height, radius(part)));

    g.fillStyle(FENCE_OUTLINE, 1);
    parts.forEach((part) => g.fillRoundedRect(part.x - 4, part.y - 4, part.width + 8, part.height + 8, radius(part) + 4));

    g.fillStyle(FENCE_PAINT, 1);
    parts.forEach((part) => g.fillRoundedRect(part.x, part.y, part.width, part.height, radius(part)));

    g.lineStyle(2, 0x000000, 0.15);
    posts.forEach((post) => g.strokeRoundedRect(post.x, post.y, post.width, post.height, radius(post)));

    const title = scene.add.text(0, -45, 'Club CMU', {
        fontFamily: 'Arial Black', fontSize: 84, color: '#c41230'
    }).setOrigin(0.5).setAngle(-2);

    const tagline = scene.add.text(0, 75, 'Walk the Cut. Paint the Fence.', {
        fontFamily: 'Arial Black', fontSize: 26, color: '#2a2a30'
    }).setOrigin(0.5);

    logo.add([ g, title, tagline ]);

    //  Slide in only. Tweening a Container's alpha from 0 left the logo
    //  invisible in Phaser 4.0.0.
    logo.setY(y + 24);
    scene.tweens.add({ targets: logo, y, duration: 450, ease: 'Back.easeOut' });

    return logo;
}

//  A rounded white button with red lettering. Drawn with Graphics for the same
//  reason as the Login scene's Google button: filled rounded Rectangles throw
//  in Phaser 4.0.0.
export function addMenuButton (scene: Scene, x: number, y: number, label: string, onClick: () => void)
{
    const width = 280;
    const height = 64;
    const button = scene.add.container(x, y);
    const bg = scene.add.graphics();

    const draw = (fill: number, text: GameObjects.Text) => {

        bg.clear();
        bg.fillStyle(0x000000, 0.25);
        bg.fillRoundedRect(-width / 2 + 4, -height / 2 + 6, width, height, 14);
        bg.fillStyle(fill, 1);
        bg.fillRoundedRect(-width / 2, -height / 2, width, height, 14);
        text.setColor(fill === CARNEGIE_RED ? '#ffffff' : '#c41230');

    };

    const text = scene.add.text(0, 0, label, {
        fontFamily: 'Arial Black', fontSize: 28, color: '#c41230'
    }).setOrigin(0.5);

    draw(0xffffff, text);
    button.add([ bg, text ]);

    bg.setInteractive({
        hitArea: new Geom.Rectangle(-width / 2, -height / 2, width, height),
        hitAreaCallback: Geom.Rectangle.Contains,
        useHandCursor: true
    });

    bg.on('pointerover', () => draw(CARNEGIE_RED, text));
    bg.on('pointerout', () => draw(0xffffff, text));
    bg.once('pointerdown', onClick);

    return button;
}

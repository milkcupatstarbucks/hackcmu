import { Scene } from 'phaser';

export type Facing = 'left' | 'right';

export const SCOTTY_KEY = 'scotty';
const SHEET_KEY = 'scotty-sheet';

//  game-player-sheet.png is hand-drawn, so its six dogs are not on a regular
//  grid. Each entry is a dog's horizontal centre and the y of its feet; the top
//  row faces right, the bottom row faces left.
const SHEET_FRAMES = [
    { centerX: 468, feetY: 711 }, { centerX: 1098, feetY: 713 }, { centerX: 1761, feetY: 684 },
    { centerX: 434, feetY: 1245 }, { centerX: 1098, feetY: 1274 }, { centerX: 1727, feetY: 1272 }
];
const SHEET_CELL = { width: 560, height: 490 };

//  Frames are baked at twice their on-screen size and drawn at scale 0.5.
export const FRAME = { width: 168, height: 147 };
export const SCOTTY_SCALE = 0.5;

//  Legs apart, legs crossed, standing. The standing frame doubles as idle.
export const IDLE_FRAME: Record<Facing, number> = { right: 2, left: 3 };
const WALK_FRAMES: Record<Facing, number[]> = { right: [ 0, 2, 1, 2 ], left: [ 5, 3, 4, 3 ] };

export const walkAnimation = (facing: Facing) => `scotty-walk-${facing}`;

//  Coat colours, tinted over the grey Scotty. The server assigns an index.
export const LOOKS = [
    { name: 'Classic', tint: 0xffffff },
    { name: 'Wheaten', tint: 0xf5cf8f },
    { name: 'Carnegie', tint: 0xff9a9a },
    { name: 'Sky', tint: 0xa9d0ff },
    { name: 'Mint', tint: 0xb2ebc2 },
    { name: 'Lilac', tint: 0xd6bcff },
    { name: 'Gold', tint: 0xffe07a },
    { name: 'Midnight', tint: 0x8a8fa8 }
];

export function loadScottySheet (scene: Scene)
{
    scene.load.image(SHEET_KEY, 'sprites/game-player-sheet.png');
}

//  Crops each dog into a uniform, feet-aligned frame and downscales it with the
//  browser's high-quality resampling. Shrinking the 2360px sheet on the GPU
//  every frame would shimmer, and uneven crops would make the dog bob.
export function createScottyAnimations (scene: Scene)
{
    if (scene.textures.exists(SCOTTY_KEY))
    {
        return;
    }

    const sheet = scene.textures.get(SHEET_KEY).getSourceImage() as HTMLImageElement;
    const canvas = document.createElement('canvas');
    canvas.width = FRAME.width * SHEET_FRAMES.length;
    canvas.height = FRAME.height;

    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    SHEET_FRAMES.forEach(({ centerX, feetY }, i) => ctx.drawImage(
        sheet,
        centerX - SHEET_CELL.width / 2, feetY - SHEET_CELL.height, SHEET_CELL.width, SHEET_CELL.height,
        i * FRAME.width, 0, FRAME.width, FRAME.height
    ));

    const texture = scene.textures.addCanvas(SCOTTY_KEY, canvas)!;

    SHEET_FRAMES.forEach((_, i) => texture.add(i, 0, i * FRAME.width, 0, FRAME.width, FRAME.height));

    scene.textures.remove(SHEET_KEY);

    for (const facing of [ 'left', 'right' ] as Facing[])
    {
        scene.anims.create({
            key: walkAnimation(facing),
            frames: WALK_FRAMES[facing].map((frame) => ({ key: SCOTTY_KEY, frame })),
            frameRate: 8,
            repeat: -1
        });
    }
}

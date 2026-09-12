import { Scene } from 'phaser';

//  A simplified, not-to-scale CMU campus: Forbes Avenue along the top, the Cut
//  with the Fence in the middle, and the Mall running south to Hamerschlag.
//  Must match CAMPUS_WIDTH / CAMPUS_HEIGHT in server/campus.mjs.
export const WORLD = { width: 2400, height: 1600 };

//  Where the server spawns new players, so the camera can start there.
export const SPAWN = { x: 1200, y: 190 };

export interface Box
{
    x: number;
    y: number;
    width: number;
    height: number;
}

const BUILDINGS: (Box & { name: string })[] = [
    { name: 'Hunt Library', x: 240, y: 170, width: 420, height: 320 },
    { name: 'Cohon University Center', x: 1760, y: 170, width: 500, height: 360 },
    { name: 'Baker & Porter Hall', x: 360, y: 780, width: 440, height: 520 },
    { name: 'Doherty Hall', x: 1580, y: 780, width: 300, height: 290 },
    { name: 'Wean Hall', x: 1580, y: 1110, width: 300, height: 230 },
    { name: 'Gates Hillman Center', x: 1960, y: 780, width: 320, height: 460 },
    { name: 'Hamerschlag Hall', x: 900, y: 1470, width: 600, height: 110 }
];

//  The Fence stands across the Cut's main walkway. Players collide with its
//  base, can walk behind its top, and open the painting board inside the zone.
export const FENCE: Box = { x: 1080, y: 360, width: 240, height: 80 };
export const FENCE_ZONE: Box = { x: 1010, y: 300, width: 380, height: 200 };

const FOREST = 0x4f8a3f;
const GRASS = 0x7fb069;
const LAWN = 0x8cc07a;
const PATH = 0xd9cfb8;
const ROAD = 0x55565c;

const TREES = [
    [ 760, 230 ], [ 1640, 230 ], [ 790, 570 ], [ 1610, 570 ], [ 980, 200 ], [ 1420, 200 ],
    ...[ 800, 910, 1020, 1130, 1240, 1320 ].flatMap((y) => [ [ 1000, y ], [ 1400, y ] ]),
    [ 160, 620 ], [ 2330, 620 ], [ 120, 1200 ], [ 2340, 1330 ], [ 760, 1530 ], [ 1640, 1530 ]
];

//  Draws the map and returns the boxes players cannot walk through.
export function drawCampusMap (scene: Scene): Box[]
{
    const g = scene.add.graphics().setDepth(0);

    g.fillStyle(GRASS, 1);
    g.fillRect(0, 0, WORLD.width, WORLD.height);

    //  Forbes Avenue and its sidewalk.
    g.fillStyle(ROAD, 1);
    g.fillRect(0, 0, WORLD.width, 110);
    g.fillStyle(0xf2e6a0, 1);

    for (let x = 20; x < WORLD.width; x += 90)
    {
        g.fillRect(x, 52, 50, 6);
    }

    g.fillStyle(PATH, 1);
    g.fillRect(0, 110, WORLD.width, 24);

    //  The Cut and the Mall are mown lawns.
    g.fillStyle(LAWN, 1);
    g.fillRect(700, 134, 1000, 506);
    g.fillRect(960, 720, 480, 660);

    //  Walkways: the Cut's diagonals and centre walk, the cross walks, the
    //  Mall's two sides, and short paths to building entrances.
    g.fillStyle(PATH, 1);
    g.fillRect(1165, 134, 70, 506);
    g.fillRect(200, 640, 2100, 80);
    g.fillRect(880, 720, 80, 660);
    g.fillRect(1440, 720, 80, 660);
    g.fillRect(200, 1380, 2100, 70);
    g.fillRect(420, 490, 80, 150);
    g.fillRect(1980, 530, 80, 110);
    g.fillRect(560, 1300, 80, 80);
    g.fillRect(1690, 1340, 80, 40);
    g.fillRect(1160, 1450, 80, 20);

    g.lineStyle(56, PATH, 1);
    g.lineBetween(740, 134, 1200, 640);
    g.lineBetween(1660, 134, 1200, 640);

    for (const building of BUILDINGS)
    {
        drawBuilding(scene, g, building);
    }

    for (const [ x, y ] of TREES)
    {
        g.fillStyle(0x000000, 0.18);
        g.fillCircle(x + 6, y + 8, 26);
        g.fillStyle(FOREST, 1);
        g.fillCircle(x, y, 26);
        g.fillStyle(0x6aa655, 1);
        g.fillCircle(x - 7, y - 8, 12);
    }

    const label = (x: number, y: number, text: string) => scene.add.text(x, y, text, {
        fontFamily: 'Arial Black', fontSize: 22, color: '#ffffff'
    }).setOrigin(0.5).setAlpha(0.6).setDepth(1);

    label(300, 55, 'Forbes Avenue');
    label(1450, 290, 'The Cut');
    label(1200, 1050, 'The Mall');

    drawFence(scene);

    return [
        { x: 0, y: 0, width: WORLD.width, height: 110 },
        { x: FENCE.x, y: FENCE.y + FENCE.height - 26, width: FENCE.width, height: 26 },
        ...BUILDINGS
    ];
}

function drawBuilding (scene: Scene, g: Phaser.GameObjects.Graphics, b: Box & { name: string })
{
    g.fillStyle(0x000000, 0.2);
    g.fillRect(b.x + 10, b.y + 12, b.width, b.height);
    g.fillStyle(0x8a6d44, 1);
    g.fillRect(b.x, b.y, b.width, b.height);
    g.fillStyle(0xd8c08f, 1);
    g.fillRect(b.x + 5, b.y + 5, b.width - 10, b.height - 10);
    g.fillStyle(0xc4a878, 1);
    g.fillRect(b.x + 24, b.y + 24, b.width - 48, b.height - 48);

    scene.add.text(b.x + b.width / 2, b.y + b.height / 2, b.name, {
        fontFamily: 'Arial Black', fontSize: 20, color: '#4a3620',
        align: 'center', wordWrap: { width: b.width - 60 }
    }).setOrigin(0.5).setDepth(1);
}

//  A small front view of the Fence, the same posts-and-two-rails shape as the
//  painting board. Its depth is its base, so players north of it walk behind.
function drawFence (scene: Scene)
{
    const { x, y, width, height } = FENCE;
    const g = scene.add.graphics().setDepth(y + height);
    const postWidth = 24;
    const bay = (width - postWidth * 4) / 3;
    const posts = [ 0, 1, 2, 3 ].map((i): Box => ({ x: x + i * (postWidth + bay), y, width: postWidth, height }));
    const rails: Box[] = [ { x, y: y + 14, width, height: 24 }, { x, y: y + 46, width, height: 20 } ];
    const parts = [ ...posts, ...rails ];

    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(x + width / 2, y + height + 2, width + 30, 22);

    g.fillStyle(0x3b2e24, 1);
    parts.forEach((p) => g.fillRoundedRect(p.x - 3, p.y - 3, p.width + 6, p.height + 6, 9));

    g.fillStyle(0xefe8da, 1);
    parts.forEach((p) => g.fillRoundedRect(p.x, p.y, p.width, p.height, 7));

    //  Decades of paint: a few coats showing through on the rails.
    g.fillStyle(0xc41230, 1);
    g.fillRoundedRect(x + 30, y + 18, 90, 16, 6);
    g.fillStyle(0x3388ff, 1);
    g.fillRoundedRect(x + 128, y + 50, 80, 12, 5);
    g.fillStyle(0xffcc00, 1);
    g.fillRoundedRect(x + 150, y + 18, 60, 16, 6);

    scene.add.text(x + width / 2, y - 26, 'The Fence', {
        fontFamily: 'Arial Black', fontSize: 20, color: '#ffffff',
        stroke: '#3b2e24', strokeThickness: 5
    }).setOrigin(0.5).setDepth(y + height);
}

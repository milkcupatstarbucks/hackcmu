import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const children = [
    spawn(process.execPath, [resolve(projectRoot, 'server/index.mjs')], {
        cwd: projectRoot,
        env: { ...process.env, PORT: process.env.PORT || '3001' },
        stdio: 'inherit'
    }),
    spawn(process.execPath, [resolve(projectRoot, 'node_modules/vite/bin/vite.js'), '--config', 'vite/config.dev.mjs'], {
        cwd: projectRoot,
        stdio: 'inherit'
    })
];

let stopping = false;
function stop(exitCode = 0) {
    if (stopping) return;
    stopping = true;
    children.forEach((child) => child.kill('SIGTERM'));
    process.exit(exitCode);
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
children.forEach((child) => child.on('exit', (code) => {
    if (!stopping) stop(code || 0);
}));

// Headless capture: screenshots at several cell sizes + an ~8s MP4 (frame-stepped, 30fps).
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const shots = path.join(root, 'shots');
fs.mkdirSync(shots, { recursive: true });
const PORT = 4173;

execFileSync('pnpm', ['build'], { cwd: root, stdio: 'inherit' });
if (!fs.existsSync(path.join(root, 'dist', 'index.html'))) {
  throw new Error('build did not produce dist/index.html');
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const only = process.argv[2]; // 'shots' | 'video' | undefined

const executablePath = [
  process.env.CHROME,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/lib64/chromium-browser/chromium-browser',
  '/usr/bin/chromium-browser',
  chromium.executablePath(),
].find((candidate) => candidate && fs.existsSync(candidate));
if (!executablePath) {
  server.kill();
  throw new Error('No Chrome/Chromium executable found. Set CHROME.');
}

let browser;
try {
  browser = await chromium.launch({
    executablePath,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const seen = new Set(); page.on('console', (m) => { const t = m.text().slice(0, 400); if (!seen.has(t)) { seen.add(t); console.log('[page]', t); } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  const open = async (q) => {
    await page.goto(`http://localhost:${PORT}/?capture&${q}`);
    await page.waitForFunction(() => window.__ready && window.__ready(), null, { timeout: 60000 });
  };
  if (only !== 'video') {
    for (const [name, cell, extra] of [['proto', 10, ''], ['cell7', 7, ''], ['cell13', 13, ''], ['cell16', 16, ''], ['closeup', 9, '&zoom=1.8'], ['clean', 10, '&hidehud']]) {
      await open(`cell=${cell}${extra}`);
      await page.evaluate(() => window.__step(1 / 30, 75)); // 2.5s in
      await page.screenshot({ path: path.join(shots, `${name}.png`) });
      console.log('shot', name);
    }
  }
  if (only !== 'shots') {
    const frames = path.join(shots, 'frames');
    fs.rmSync(frames, { recursive: true, force: true });
    fs.mkdirSync(frames);
    await open('cell=10');
    await page.evaluate(() => { window.__step(1 / 30, 15); });
    const N = 240;
    for (let i = 0; i < N; i++) {
      await page.evaluate((i) => { window.__set('orbit', 0); window.__set('az', Math.PI / 4 - 0.35 + i * 0.003); window.__step(1 / 30); }, i);
      await page.screenshot({ path: path.join(frames, `f${String(i).padStart(4, '0')}.png`) });
    }
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(frames, 'f%04d.png'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', path.join(shots, 'proto.mp4')]);
    fs.rmSync(frames, { recursive: true, force: true });
    console.log('video done');
  }
} finally {
  await browser?.close();
  server.kill();
}

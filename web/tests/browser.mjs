// Real WebGL + mobile-touch smoke test. Start Vite separately (npm run dev).
// Chromium test binary is an optional development dependency, not shipped to players.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { brotliDecompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { chromium as playwright } from '@playwright/test';
import chromium from '@sparticuz/chromium';

const base = process.env.TEST_BASE_URL || 'http://localhost:5173';
const output = '.cache/oasis-tests'; await mkdir(output, { recursive: true });
let executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
let libPath = process.env.LD_LIBRARY_PATH || '';
if (!executablePath) {
  executablePath = await chromium.executablePath();
  // Bundled Linux libraries let the test run in a minimal Debian sandbox.
  const libs = path.join(os.tmpdir(), 'oasis-browser-al2023');
  await mkdir(libs, { recursive: true });
  const archive = path.join(libs, 'libs.tar');
  await writeFile(archive, brotliDecompressSync(await readFile('node_modules/@sparticuz/chromium/bin/al2023.tar.br')));
  execFileSync('tar', ['-xf', archive, '-C', libs]);
  libPath = path.join(libs, 'lib') + ':' + libPath;
}
const browser = await playwright.launch({ executablePath, headless: true,
  args: chromium.args.filter(a => a !== '--disable-web-security'),
  env: { ...process.env, LD_LIBRARY_PATH: libPath },
});
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base); await page.locator('#start-game').waitFor();
  await page.screenshot({ path: `${output}/welcome.png` });
  await page.locator('#start-game').tap();
  await page.waitForFunction(() => window.__oasis?.view.renderer.info.render.calls > 0);
  check(await page.locator('.fatal-message').count() === 0, 'WebGL initialized');
  check(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), 'no horizontal overflow at 390px');

  const client = await context.newCDPSession(page);
  const rect = await page.locator('#joystick').boundingBox();
  const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
  const before = await page.evaluate(() => [...window.__oasis.game.state.position]);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 35, y, id: 1 }] });
  await page.waitForTimeout(650);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const after = await page.evaluate(() => [...window.__oasis.game.state.position]);
  check(after[0] > before[0] + 0.2, 'touch joystick actually moves character');
  await page.waitForTimeout(250);
  const stopped = await page.evaluate(() => [...window.__oasis.game.state.position]);
  check(Math.hypot(stopped[0] - after[0], stopped[1] - after[1]) < 0.01, 'release does not leave movement stuck');

  const action = await page.locator('#interact').boundingBox();
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 30, y, id: 1 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x + 30, y, id: 1 }, { x: action.x + 35, y: action.y + 35, id: 2 }] });
  await page.waitForTimeout(150);
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check(await page.evaluate(() => !window.__oasis.paused), 'multitouch does not interrupt the game');

  // Positioning is a development-only test seam; interactions below use real UI buttons.
  const position = async point => { await page.evaluate(p => { window.__oasis.game.state.position = p; window.__oasis.refresh(); }, point); await page.waitForTimeout(100); };
  const act = async () => { await page.waitForTimeout(260); await page.locator('#interact').tap(); };
  await position([-6, -5]);
  for (let i = 0; i < 3; i++) await act();
  check(await page.locator('#count-wood').textContent() === '3', 'gather UI updates inventory');
  check(await page.evaluate(() => !window.__oasis.view.resources.get('tree_0').visible), 'depleted tree disappears');
  await page.locator('#craft').tap(); await page.locator('#make-plank').tap();
  check(await page.locator('#count-plank').textContent() === '1', 'crafting creates real plank');
  check(await page.locator('#make-plank').isDisabled(), 'crafting disabled without enough wood');
  await page.locator('#modal-close').tap();
  await position([-9, -2]); await act();
  await page.locator('#craft').tap(); await page.locator('#make-plank').tap(); await page.locator('#modal-close').tap();
  await position([-4, 1]); await act();
  // Walk to the right first to orient the placement preview toward [3,1].
  await position([3, 2]);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + 35, y, id: 1 }] });
  await page.waitForTimeout(120); await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.locator('#build').tap();
  check(await page.locator('#build-controls').isVisible(), 'mobile construction controls visible');
  await page.locator('#rotate').tap(); await act();
  check(await page.evaluate(() => window.__oasis.game.state.buildings.length) === 1, 'touch construction places a building');
  check(await page.locator('#count-plank').textContent() === '0', 'building consumes actual resources');
  await page.locator('#cancel-build').tap();

  await position([2, 4]); await act(); await act();
  check(await page.evaluate(() => window.__oasis.game.state.crops['1,2'].watered), 'plant and water with touch');
  await page.evaluate(() => { window.__oasis.game.tick(30); window.__oasis.refresh(); }); // Fast-forward test simulation only.
  await act();
  check(await page.locator('#count-crop').textContent() === '2', 'harvest yields crops');
  check(await page.locator('#count-seed').textContent() === '6', 'harvest returns seeds');
  check(await page.evaluate(() => Object.values(window.__oasis.game.state.milestones).every(Boolean)), 'all three starter goals completed');
  await page.locator('#bag').tap();
  const pausedAt = await page.evaluate(() => window.__oasis.game.state.playSeconds);
  await page.waitForTimeout(300);
  check(await page.evaluate(() => window.__oasis.game.state.playSeconds) === pausedAt, 'modal pauses simulation');
  await page.locator('#modal-close').tap();
  await page.locator('#settings').tap(); await page.locator('#save-now').tap();
  await page.reload(); await page.locator('#start-game').tap();
  check(await page.locator('#count-crop').textContent() === '2', 'saved inventory survives reload');
  check(await page.evaluate(() => window.__oasis.game.state.buildings.length) === 1, 'saved buildings survive reload');

  // Build a full house using the real touch controls. Extra inventory is a
  // fixture here; resource gathering/crafting have already been tested above.
  await position([3,2]);
  await client.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x,y,id:1}]});
  await client.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:x+35,y,id:1}]});
  await page.waitForTimeout(120);await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.evaluate(()=>{Object.assign(window.__oasis.game.state.inventory,{plank:6,wood:2,stone:4});window.__oasis.refresh();});
  await page.locator('#build').tap();
  let selected=0,turn=0;
  for(const [kind,wantTurn] of [[1,0],[1,1],[3,3],[4,2],[5,2]]) {
    while(selected!==kind){await page.locator('#cycle').tap();selected=(selected+1)%6;}
    while(turn!==wantTurn){await page.locator('#rotate').tap();turn=(turn+1)%4;}
    await act();
  }
  check(await page.evaluate(()=>window.__oasis.game.state.buildings.length)===6,'touch controls layer four house edges and roof over floor');
  check(await page.evaluate(()=>window.__oasis.view.buildings.children.length)===6,'all constructed house pieces are rendered');
  await page.locator('#cancel-build').tap();
  await page.evaluate(()=>window.__oasis.save());await page.reload();await page.locator('#start-game').tap();
  check(await page.evaluate(()=>window.__oasis.game.state.buildings.length)===6,'complete house survives reload');
  check(await page.evaluate(()=>window.__oasis.view.camera.isPerspectiveCamera),'behind-player camera is perspective');
  await position([6,6]);
  await page.waitForFunction(()=>window.__oasis.view.radius<6.8);
  await page.waitForTimeout(1300);
  check(await page.evaluate(()=>window.__oasis.view.renderer.info.render.calls<250),'static scenery batching limits draw calls in tested scene');
  await page.screenshot({ path: `${output}/mobile.png` });
  await page.locator('#overview').tap(); await page.waitForTimeout(350);
  await page.screenshot({ path: `${output}/island-overview.png` });
  await page.locator('#overview').tap();
  for (const [width, height, name] of [[844, 390, 'landscape'], [1440, 900, 'desktop']]) {
    await page.setViewportSize({ width, height }); await page.waitForTimeout(1800);
    check(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth), `no overflow at ${width}px`);
    await page.screenshot({ path: `${output}/${name}.png` });
  }
  await page.evaluate(() => { localStorage.setItem('pocket-oasis.web.v1', 'broken'); localStorage.setItem('pocket-oasis.web.v1.bak', 'broken'); });
  await page.reload(); await page.locator('#confirm-reset').waitFor();
  check(await page.evaluate(() => localStorage.getItem('pocket-oasis.web.v1')) === 'broken', 'corrupt saves are not overwritten before confirmation');
  await page.locator('#confirm-reset').click();
  check(await page.locator('#count-seed').textContent() === '5', 'explicit reset starts clean world');
  check(errors.length === 0, `no runtime errors: ${errors.join('; ')}`);
  console.log(`PASS: ${checks} browser checks, mobile touch + WebGL + save/reload; screenshots in ${output}`);
} finally { await browser.close(); }

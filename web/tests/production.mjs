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
try {
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto(base);await page.locator('#start-game').tap();await page.waitForTimeout(3500);
 assert.equal(await page.locator('.fatal-message').count(),0);
 assert.equal(await page.evaluate(()=>typeof window.__oasis),'undefined');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth===innerWidth),true);
 await page.screenshot({path:output+'/production-valley.png'});
 const old={version:1,inventory:{wood:7,stone:0,plank:0,seed:5,crop:0},gathered:{},buildings:[{kind:'wall',cell:[3,1],rotation:0}],crops:{},position:[0,0],yaw:0,playSeconds:0,milestones:{crafted:false,built:false,harvested:false}};
 await page.evaluate(s=>localStorage.setItem('pocket-oasis.web.v1',JSON.stringify(s)),old);
 await page.reload();await page.locator('#start-game').tap();assert.equal(await page.locator('#count-wood').textContent(),'7');
 await page.locator('#settings').tap();await page.locator('#save-now').tap();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-oasis.web.v1')));
 assert.equal(saved.version,2);assert.equal(saved.buildings[0].legacy,true);assert.equal(saved.inventory.wood,7);
 await page.reload();await page.locator('#start-game').tap();assert.equal(await page.locator('#count-wood').textContent(),'7');
 const response=await page.request.get(base+'/THIRD_PARTY.txt');assert.equal(response.status(),200);
 assert.deepEqual(errors,[]);console.log('PASS: production WebGL, 390px layout, no DEV hook, old-save migration, save/reload, licenses, no browser errors.');
}finally{await browser.close();}

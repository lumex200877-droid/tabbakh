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
 const page=await context.newPage();page.on('pageerror',e=>console.log('ERROR',e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
 await page.goto(base);await page.locator('#start-game').tap();
 await page.waitForFunction(()=>window.__oasis?.view.radius<6.75);
 await page.screenshot({path:output+'/valley-portrait.png'});
 console.log(await page.evaluate(()=>({calls:window.__oasis.view.renderer.info.render.calls,triangles:window.__oasis.view.renderer.info.render.triangles,camera:window.__oasis.view.camera.position.toArray(),player:window.__oasis.view.player.position.toArray()})));
 for(const [w,h,n] of [[844,390,'valley-landscape'],[1440,900,'valley-desktop']]) {await page.setViewportSize({width:w,height:h});await page.waitForTimeout(1800);await page.screenshot({path:output+'/'+n+'.png'});}
}finally{await browser.close();}

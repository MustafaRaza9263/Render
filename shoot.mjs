import { chromium } from 'playwright-core';
const base = process.env.URL || 'http://localhost:4173/';
const all = [
  ['aerial_day', 'view=aerial&mode=day'],
  ['isometric_day', 'view=iso&mode=day&labels=1'],
  ['dusk', 'view=aerial&mode=dusk'],
  ['night_aerial', 'view=aerial&mode=night'],
  ['courtyard_lookup', 'view=courtyard&mode=dusk'],
  ['skybridge_closeup', 'view=bridge&mode=day'],
  ['street_level', 'view=street&mode=day'],
];
const only = process.argv.slice(2);
const list = only.length ? all.filter(s => only.includes(s[0])) : all;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
for (const [name, q] of list) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') console.log(name, m.type(), m.text().slice(0, 300)); });
  page.on('pageerror', e => console.log(name, 'PAGEERROR', e.message));
  const t0 = Date.now();
  await page.goto(base + '?shot=1&' + q + (process.env.EXTRA || ''));
  await page.waitForSelector('body[data-ready="1"]', { timeout: 600000 });
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => window.__stats);
  await page.screenshot({ path: `/workspace/seven/shots/${name}.png` }); if (process.env.V) await page.screenshot({ path: `/tmp/${process.env.V}_${name}.png` });
  console.log(name, 'ok', ((Date.now() - t0) / 1000).toFixed(1) + 's', JSON.stringify(st));
  await page.close();
}
await browser.close();

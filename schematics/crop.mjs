// Crop KiCad-exported SVGs to their content bbox and optionally render PNG previews.
// usage: node crop.mjs <in.svg...> --out <dir> [--png]
import { createRequire } from 'module';
const { chromium } = createRequire(import.meta.url)('playwright');
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const outDir = args[outIdx + 1];
const png = args.includes('--png');
const files = args.filter((a, i) => !a.startsWith('--') && i !== outIdx + 1);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
for (const f of files) {
  let svg = fs.readFileSync(f, 'utf8');
  await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
  const box = await page.evaluate(() => {
    const s = document.querySelector('svg');
    const b = s.getBBox();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  });
  const m = Math.max(box.w, box.h) * 0.04 + 1.5;
  const vb = `${(box.x - m).toFixed(2)} ${(box.y - m).toFixed(2)} ${(box.w + 2 * m).toFixed(2)} ${(box.h + 2 * m).toFixed(2)}`;
  svg = svg
    .replace(/<\?xml[^>]*>\s*/, '')
    .replace(/<!DOCTYPE[^>]*>\s*/, '')
    .replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1')
    .replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1')
    .replace(/viewBox="[^"]*"/, `viewBox="${vb}"`)
    .replace(/<title>[\s\S]*?<\/title>/, '')
    .replace(/<desc>[\s\S]*?<\/desc>/, '');
  const name = path.basename(f);
  fs.writeFileSync(path.join(outDir, name), svg);
  if (png) {
    await page.setViewportSize({ width: 900, height: Math.round(900 * (box.h + 2 * m) / (box.w + 2 * m)) });
    await page.setContent(`<html><body style="margin:0;background:#fff">${svg.replace('<svg', '<svg style="width:900px;height:auto;display:block"')}</body></html>`);
    await page.screenshot({ path: path.join(outDir, name.replace('.svg', '.png')), fullPage: true });
  }
}
await browser.close();

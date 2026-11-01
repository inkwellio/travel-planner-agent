// 校验「导出卡片」：先 npm run dev，再 node scripts/verify-export-card.mjs
// 需要本机 playwright chromium 与 ffmpeg。结束时删掉本脚本创建的测试行程。
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function samplePng(file) {
  const run = args => spawnSync('ffmpeg', ['-v', 'error', ...args], { encoding: 'buffer' });
  const corner = run(['-i', file, '-vf', 'crop=8:8:2:2,scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  const small = run(['-i', file, '-vf', 'scale=180:-1:flags=neighbor', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1']);
  if (corner.status || small.status) throw new Error('ffmpeg sample failed');
  let primary = 0, varied = 0, prev = 0;
  const data = small.stdout;
  for (let i = 0; i + 2 < data.length; i += 3) {
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    if (key !== prev) varied++;
    prev = key;
    if (Math.abs(data[i] - 91) < 18 && Math.abs(data[i + 1] - 123) < 18 && Math.abs(data[i + 2] - 122) < 18) primary++;
  }
  return { corner: [...corner.stdout.subarray(0, 3)], primary, varied };
}

const URL = process.env.URL ?? 'http://127.0.0.1:5173';
const UID = 'card' + Date.now();
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('✓', m); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(id => localStorage.setItem('travel-agent:uid', id), UID);
const page = await ctx.newPage();
page.setDefaultTimeout(20000);
page.on('pageerror', e => console.log('PAGEERROR', e.message));
page.on('console', m => { if (m.type() === 'error' || m.text().includes('export-card')) console.log('BROWSER', m.type(), m.text()); });

await page.goto(URL);
await page.waitForSelector('textarea');
await page.fill('textarea', '带爸妈慢慢逛西湖，少爬坡');
await page.click('[aria-label="发送"]');
await page.waitForSelector('[data-testid="rec-card"]');
await page.locator('[data-testid="generate"]').last().click();
await page.waitForSelector('[data-testid="timeline"]', { timeout: 30000 });
await page.waitForFunction(() => {
  const b = document.querySelector('[data-testid="export-card"]');
  return b && !b.disabled;
}, null, { timeout: 30000 });
assert(await page.locator('[data-testid="export-card"]').isEnabled(), '桌面导出卡片可点');

const panelText = await page.locator('[data-testid="timeline"]').innerText();
const [cardSeen, download] = await Promise.all([
  page.waitForSelector('[data-testid="result-card"]'),
  page.waitForEvent('download', { timeout: 45000 }),
  page.click('[data-testid="export-card"]'),
]);
const cardText = await cardSeen.innerText();
const name = download.suggestedFilename();
assert(/天路线\.png$/.test(name), '文件名 ' + name);
const out = '/tmp/result-card.png';
await download.saveAs(out);
await page.waitForFunction(() => document.querySelector('[data-testid="export-card"]')?.getAttribute('data-export-state') === 'done', null, { timeout: 5000 });
assert(await page.locator('[data-testid="result-card"]').count() === 0, '导出后离屏卡片卸掉');

const buf = readFileSync(out);
assert(buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'PNG 头');
const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
assert(w >= 1400 && h >= 800, `尺寸 ${w}x${h}`);
console.log('file', name, buf.length, `${w}x${h}`);

const stopNames = await page.locator('[data-testid="timeline"] h3').allTextContents();
assert(stopNames.length > 0, '时间线有站点');
for (const s of stopNames) assert(cardText.includes(s), '卡片含站点 ' + s);
assert(cardText.includes('Day 1') && cardText.includes('Day 2'), '卡片含两天');
const during = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
assert(during.sw <= during.iw + 1, '导出后页面不横向溢出');
console.log('card head', cardText.slice(0, 160).replace(/\n/g, ' | '));
const stats = samplePng(out);
console.log('pixels', JSON.stringify(stats));
const [r, g, b] = stats.corner;
assert(Math.abs(r - 245) < 8 && Math.abs(g - 242) < 8 && Math.abs(b - 236) < 8, `宣纸边角 rgb(${r},${g},${b})`);
assert(stats.primary > 50, '含青瓷主色像素 ' + stats.primary);
assert(stats.varied > 30, '不是纯色 ' + stats.varied);

await page.setViewportSize({ width: 1024, height: 800 });
await page.waitForTimeout(200);
const narrow = await page.locator('[data-testid="export-card"]').boundingBox();
const sheet = await page.locator('[data-testid="route-sheet"]').boundingBox();
console.log('1024', JSON.stringify({ narrow, sheet }));
assert(narrow && sheet && narrow.x >= sheet.x - 1 && narrow.x + narrow.width <= sheet.x + sheet.width + 1, '1024 宽度下按钮在结果栏内');

// 手机：先展开底部规划结果，按钮在视口内，页面不横向溢出
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-CN' });
await mctx.addInitScript(id => localStorage.setItem('travel-agent:uid', id), UID);
const mob = await mctx.newPage();
await mob.goto(URL);
await mob.waitForSelector('[aria-label="展开/收起规划结果"]');
await mob.click('[aria-label="展开/收起规划结果"]');
await mob.waitForFunction(() => document.querySelector('[data-testid="route-sheet"]').getBoundingClientRect().height > 700);
await mob.waitForSelector('[data-testid="export-card"]', { timeout: 15000 });
const box = await mob.locator('[data-testid="export-card"]').boundingBox();
const scroll = await mob.evaluate(() => {
  const sheet = document.querySelector('[data-testid="route-sheet"]').getBoundingClientRect();
  const btn = document.querySelector('[data-testid="export-card"]').getBoundingClientRect();
  return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, sheet: { y: sheet.y, h: sheet.height }, btn: { x: btn.x, y: btn.y, w: btn.width, h: btn.height } };
});
console.log('mobile', JSON.stringify({ box, scroll }));
assert(box && box.x >= -1 && box.x + box.width <= 391 && box.y >= 0 && box.y + box.height <= 844, '手机按钮在视口内');
assert(scroll.sw <= scroll.iw + 1, '手机无横向滚动');
await mob.screenshot({ path: '/tmp/mobile-export-buttons.png', timeout: 8000 });
await page.screenshot({ path: '/tmp/desktop-export-buttons.png', timeout: 8000 });

await mob.evaluate(async uid => { for (const t of await (await fetch('/api/trips', { headers: { 'X-User-Id': uid } })).json()) await fetch('/api/trips/' + t.id, { method: 'DELETE', headers: { 'X-User-Id': uid } }); }, UID);
await browser.close();
console.log('ok');

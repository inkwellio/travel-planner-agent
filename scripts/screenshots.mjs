// 端到端冒烟 + 截图（mock 模式）：先 npm run dev，再 node scripts/screenshots.mjs
// 结束时删除本脚本创建的行程（按测试用匿名 ID 隔离，不影响真实用户）
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
const URL = process.env.URL ?? 'http://localhost:5173';
const UID = 'e2e' + Date.now();
const log = (...a) => console.log('[e2e]', ...a);
const browser = await chromium.launch();
const ctxOpts = { locale: 'zh-CN', timezoneId: 'Asia/Taipei' };
const withUid = async ctx => { await ctx.addInitScript(id => localStorage.setItem('travel-agent:uid', id), UID); return ctx; };
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); log('✓', m); };

async function flow(page, fresh) {
  await page.goto(URL); await page.waitForSelector('textarea');
  if (fresh) {
    await page.getByText('新建行程').first().click(); await page.waitForTimeout(300);
    const chip = page.locator('[data-key="destination"]');
    const chipText = await chip.innerText();
    assert(!chipText.includes('杭州'), '新行程规划参数不预填杭州');
    assert(chipText.includes('目的地'), '未设置时芯片显示目的地');
    await chip.click();
    const cityInput = page.locator('[role="dialog"] input');
    await cityInput.fill('南京');
    await cityInput.blur();
    await page.locator('[data-map-mode="city"]').waitFor();
    assert(await page.locator('[data-map-mode="city"]').count() === 1, '填了目的地后右栏是城市地图');
    assert(await page.getByText('在聊天里勾选景点，点「生成路线」').count() === 1, '未生成路线时保留引导');
    assert(await page.locator('svg[viewBox="0 0 300 196"]').count() === 0, '不再显示空状态线稿');
  }
  await page.fill('textarea', '带爸妈慢慢逛西湖，少爬坡');
  await page.click('[aria-label="发送"]');
  await page.waitForSelector('[data-testid="rec-card"]');
  assert(await page.locator('[data-testid="rec-card"]').count() > 0, '推荐卡出现');
  await page.locator('[data-testid="generate"]').last().click();
  await page.waitForSelector('[data-testid="skeleton"]', { timeout: 10000 }); log('✓ 骨架屏');
  assert(await page.locator('[data-testid="edit-actions"]').count() === 0, '生成中不可编辑');
  await page.waitForSelector('[data-testid="stream-banner"]', { state: 'detached', timeout: 30000 }); log('✓ 逐天流式完成');
  assert(await page.locator('[data-map-mode="route"]').count() >= 1, '生成后仍是路线地图');
}
const h2 = p => p.locator('h2').first().textContent();

// —— 桌面 ——
const dctx = await withUid(await browser.newContext({ ...ctxOpts, viewport: { width: 1440, height: 900 } }));
const desk = await dctx.newPage();
await flow(desk, true);
assert(await desk.locator('[data-testid="leg"]').count() > 0, '交通段');
assert(await desk.locator('[data-testid="weather-alert"]').count() > 0, '雨天提醒+室内备选');
// 拖拽排序（鼠标）
async function dragFirstDown(page) {
  const handles = page.locator('[data-testid="drag-handle"]');
  const b0 = await handles.nth(0).boundingBox(), b1 = await handles.nth(1).boundingBox();
  await page.mouse.move(b0.x + 8, b0.y + 8); await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(b0.x + 8, b0.y + 8 + (b1.y - b0.y + 60) * i / 12);
  await page.mouse.up();
}
const firstName = await desk.locator('[data-testid="stop"] h3').first().textContent();
await dragFirstDown(desk);
await desk.waitForFunction(() => document.querySelector('h2')?.textContent?.includes('v2'));
assert((await desk.locator('[data-testid="stop"] h3').first().textContent()) !== firstName, '拖拽排序生成 v2');
await desk.click('[data-testid="rollback"]');
await desk.waitForFunction(() => document.querySelector('h2')?.textContent?.includes('v1')); log('✓ 回退 v1');
await desk.selectOption('[data-testid="version-select"]', '2');
await desk.waitForFunction(() => document.querySelector('h2')?.textContent?.includes('v2')); log('✓ 切换 v2');
// 限流提示（拦截接口模拟 429，验证文案与倒计时恢复）
await desk.route('**/api/trips/*/chat', r => r.fulfill({ status: 429, headers: { 'Retry-After': '3', 'Content-Type': 'application/json' }, body: JSON.stringify({ error: '规划得有点快，稍等几秒再试', code: 'rate', retryAfter: 3 }) }));
await desk.fill('textarea', '再推荐几个'); await desk.click('[aria-label="发送"]');
await desk.getByText('规划得有点快，稍等几秒再试').last().waitFor();
assert(await desk.locator('textarea').isDisabled() && await desk.locator('[data-testid="cooldown"]').count() === 1, '每分钟超限：提示 + 输入框倒计时');
await desk.waitForFunction(() => !document.querySelector('textarea').disabled, null, { timeout: 6000 });
log('✓ Retry-After 到期后输入框自动恢复');
await desk.unroute('**/api/trips/*/chat');
await desk.route('**/api/trips/*/chat', r => r.fulfill({ status: 429, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: '今天的规划次数已用完，明天再来', code: 'daily' }) }));
await desk.fill('textarea', '再推荐几个'); await desk.click('[aria-label="发送"]');
await desk.getByText('今天的规划次数已用完，明天再来').last().waitFor(); log('✓ 每日额度提示');
await desk.unroute('**/api/trips/*/chat');
await desk.reload(); await desk.waitForSelector('[data-testid="timeline"]');
// 搜索历史
await desk.fill('[data-testid="trip-search"]', '灵隐');
assert(await desk.locator('aside .group').count() >= 1, '搜索历史行程命中');
await desk.fill('[data-testid="trip-search"]', '不存在的关键词');
assert(await desk.getByText('没有匹配的行程').count() === 1, '搜索无结果提示');
await desk.fill('[data-testid="trip-search"]', '');
await desk.locator('[data-testid="timeline"]').evaluate(e => { const sc = e.closest('.overflow-y-auto'); if (sc) sc.scrollTop = 0; });
await desk.waitForTimeout(600);
await desk.screenshot({ path: 'screenshots/desktop-1440x900.png' });
// 分享（快照）
await desk.click('[data-testid="share"]');
const shareUrl = await desk.locator('[data-testid="share-toast"] a').getAttribute('href');
assert(/\/s\/[A-Za-z0-9_-]{21}$/.test(shareUrl), '分享 ID 为 21 位随机串');
const tripId = await desk.evaluate(async uid => (await (await fetch('/api/trips', { headers: { 'X-User-Id': uid } })).json())[0].id, UID);
// 分享后再修改，不影响分享
await desk.click('[data-testid="share-toast"] button');
await dragFirstDown(desk);
await desk.waitForFunction(() => document.querySelector('h2')?.textContent?.includes('v3')); log('✓ 分享后继续修改生成 v3');
const other = await browser.newContext({ ...ctxOpts, viewport: { width: 1280, height: 900 } }); // 另一个匿名用户
const sp = await other.newPage(); await sp.goto(shareUrl); await sp.waitForSelector('[data-testid="day-readonly"]');
assert((await sp.textContent('h1')).includes('v2'), '分享页绑定 v2 快照');
assert(await sp.locator('[data-testid="drag-handle"]').count() === 0, '分享页只读');
await sp.screenshot({ path: 'screenshots/share-readonly.png', fullPage: false });
const otherUid = await sp.evaluate(() => localStorage.getItem('travel-agent:uid'));
await sp.click('[data-testid="copy-share"]'); await sp.waitForURL(u => !u.pathname.startsWith('/s/')); await sp.waitForSelector('[data-testid="timeline"]');
const otherTrips = await sp.evaluate(async uid => (await (await fetch('/api/trips', { headers: { 'X-User-Id': uid } })).json()), otherUid);
assert(otherTrips.length === 1 && otherTrips[0].activeVersion === 1, '复制到我的行程（归当前匿名 ID）');
assert(!(await sp.evaluate(async ([uid, id]) => (await fetch('/api/trips/' + id, { headers: { 'X-User-Id': uid } })).ok, [otherUid, tripId])), '行程按匿名 ID 隔离');
// 导出 PDF（按天分页）
const pp = await dctx.newPage(); await pp.goto(`${URL}/print/${tripId}?v=2&auto=0`); await pp.waitForSelector('[data-testid="day-readonly"]');
await pp.waitForTimeout(500);
await pp.pdf({ path: 'screenshots/export-sample.pdf', format: 'A4', printBackground: true });
const pages = Number(execSync('pdfinfo screenshots/export-sample.pdf').toString().match(/Pages:\s+(\d+)/)[1]);
assert(pages >= 3, `导出 PDF 共 ${pages} 页（封面 + 每天至少一页）`);
// 清理分享副本
await sp.evaluate(async ([uid, id]) => fetch('/api/trips/' + id, { method: 'DELETE', headers: { 'X-User-Id': uid } }), [otherUid, otherTrips[0].id]);

// —— 手机 ——
const mctx = await withUid(await browser.newContext({ ...ctxOpts, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }));
const mob = await mctx.newPage();
await flow(mob, false);
await mob.waitForTimeout(500);
const sheetTop = await mob.locator('[data-testid="route-sheet"]').evaluate(e => e.getBoundingClientRect().top);
const chipsBottom = await mob.locator('[data-key="destination"]').evaluate(e => e.getBoundingClientRect().bottom);
assert(sheetTop <= chipsBottom - 20 && sheetTop >= 60, `全屏抽屉盖住状态标签栏（top=${Math.round(sheetTop)}）`);
await mob.screenshot({ path: 'screenshots/mobile-390x844-sheet.png' });
// （原 snapped 断言按新全屏高度计算）
// 跟手拖动：拖到中间停住，高度应在半屏附近
const hd = await mob.locator('[aria-label="展开/收起规划结果"]').boundingBox();
await mob.mouse.move(hd.x + hd.width / 2, hd.y + 10); await mob.mouse.down();
for (let i = 1; i <= 10; i++) await mob.mouse.move(hd.x + hd.width / 2, hd.y + 10 + 300 * i / 10);
const mid = await mob.locator('[data-testid="route-sheet"]').evaluate(e => e.getBoundingClientRect().height);
await mob.mouse.up(); await mob.waitForTimeout(400);
const snapped = await mob.locator('[data-testid="route-sheet"]').evaluate(e => e.getBoundingClientRect().height);
assert(Math.abs(mid - (844 - 64 - 300)) < 40, `底部抽屉跟手（拖动中高度 ${Math.round(mid)}px）`);
assert(Math.abs(snapped - 422) < 10, `松手吸附半屏（${Math.round(snapped)}px）`);
await mob.screenshot({ path: 'screenshots/mobile-390x844-half.png' });
await mob.click('[aria-label="展开/收起规划结果"]'); await mob.waitForTimeout(400);
await mob.screenshot({ path: 'screenshots/mobile-390x844.png' });
await mob.click('[aria-label="历史行程"]'); await mob.waitForTimeout(300);
await mob.screenshot({ path: 'screenshots/mobile-390x844-drawer.png' });

if (!process.env.KEEP) {
  await mob.evaluate(async uid => { for (const t of await (await fetch('/api/trips', { headers: { 'X-User-Id': uid } })).json()) await fetch('/api/trips/' + t.id, { method: 'DELETE', headers: { 'X-User-Id': uid } }); }, UID);
  log('✓ 已清理测试行程');
}
await browser.close(); log('ok');

import assert from 'node:assert/strict';
import test from 'node:test';
import { asksForNationalFastFood, isFoodRequest, recommendFood } from './food.js';
import type { MapProvider } from './map/MapProvider.js';

test('美食问题查询餐饮而不是景点', async () => {
  assert.equal(isFoodRequest('有没有好吃的呢'), true);
  assert.equal(isFoodRequest('补充老字号杭帮菜推荐'), true);
  assert.equal(isFoodRequest('推荐风景，不要推荐美食'), false);
  let args: unknown[] = [];
  const map = { name: 'amap', searchPoi: async (...a: unknown[]) => {
    args = a;
    return [{ name: '测试餐厅', address: '测试路 1 号', location: { lng: 0, lat: 0 }, rating: 4.5 }];
  } } as unknown as MapProvider;
  const reply = await recommendFood('上海', '有没有好吃的呢', map);
  assert.deepEqual(args, ['餐厅', '上海', { types: '050000' }]);
  assert.match(reply, /测试餐厅：测试路 1 号，评分 4.5/);
  assert.match(await recommendFood('上海', '好吃的', { name: 'mock' } as MapProvider), /无法推荐具体店铺/);
});

const place = (name: string, address = '河坊街') => ({ name, address, location: { lng: 120.1, lat: 30.2 }, rating: 4.6 });

test('好吃的默认让本地餐厅排在全国连锁快餐前面，用户点名时保留', async () => {
  const calls: unknown[][] = [];
  const chains = ['肯德基（湖滨店）', '麦当劳', '必胜客', '汉堡王', '德克士', '华莱士', '塔斯汀', '赛百味', '达美乐', '棒约翰'].map(name => place(name, '连锁路'));
  const locals = ['楼外楼', '知味观', '奎元馆', '新白鹿', '外婆家'].map(name => place(name));
  const map = { name: 'amap', searchPoi: async (...args: unknown[]) => {
    calls.push(args);
    const page = (args[2] as { page?: number }).page ?? 1;
    return page === 1 ? chains : locals;
  } } as unknown as MapProvider;
  const reply = await recommendFood('杭州', '杭州有什么好吃的', map, '餐厅');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ['餐厅', '杭州', { types: '050000' }]);
  assert.equal((calls[1][2] as { page: number }).page, 2);
  assert.match(reply, /1\. 楼外楼：河坊街/);
  assert.match(reply, /知味观/);
  assert.match(reply, /已跳过/);
  assert.doesNotMatch(reply.split('：\n')[1] ?? '', /肯德基|麦当劳|必胜客|汉堡王/);

  calls.length = 0;
  const mixed = { name: 'amap', searchPoi: async () => [
    place('肯德基（武林店）', '武林路'), place('楼外楼'), place('麦当劳', '延安路'), place('知味观'),
    place('必胜客', '湖滨'), place('奎元馆'), place('汉堡王', '解放路'), place('新白鹿'), place('德克士', '凤起路'), place('外婆家'),
  ] } as unknown as MapProvider;
  const mixedReply = await recommendFood('杭州', '不要肯德基，有什么好吃的', mixed);
  assert.match(mixedReply, /1\. 楼外楼/);
  assert.doesNotMatch(mixedReply.split('：\n')[1] ?? '', /肯德基|麦当劳|必胜客/);

  assert.equal(asksForNationalFastFood('特别想吃肯德基'), true);
  assert.equal(asksForNationalFastFood('不要肯德基，有什么好吃的'), false);
  const asked = await recommendFood('杭州', '想吃肯德基', map, '肯德基');
  assert.match(asked, /肯德基（湖滨店）/);

  const onlyChains = { name: 'amap', searchPoi: async () => chains.slice(0, 3) } as unknown as MapProvider;
  const emptyLocal = await recommendFood('开封', '开封有什么好吃的', onlyChains);
  assert.match(emptyLocal, /暂时没有足够的本地餐厅/);
  assert.doesNotMatch(emptyLocal, /连锁路/);
});

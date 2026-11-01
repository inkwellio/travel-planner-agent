import assert from 'node:assert/strict';
import test from 'node:test';
import { suggestionChips } from '../../shared/suggestionChips.js';

const blob = (destination: string, text: string, context?: Parameters<typeof suggestionChips>[2]) => suggestionChips(destination, text, context).map(chip => `${chip.label}\n${chip.text}`).join('\n');
const success = '已按本轮需求筛选南京的景点。按南京 2 天、「轻松」每天约 3 个景点的参考节奏，推荐 2 个候选景点，可勾选后生成路线。';

test('追问芯片跟随当前目的地和最新助手回复，不泄漏杭州示例', () => {
  const nature = blob('开封', '已检索到开封的风景或公园类地点。公开资料较少，未能逐条核验「自然风光」，以下 4 个是地图类别可核对的候选。');
  assert.match(nature, /开封/);
  assert.match(nature, /自然风光/);
  assert.match(nature, /本地特色餐厅/);
  assert.doesNotMatch(nature, /杭州|杭帮菜|室内茶馆/);

  const mixed = blob('南京', '已检索到南京的自然风光或人文历史类地点。公开资料较少，未能逐条核验「自然风光、人文历史、轻松节奏」，以下 2 个是地图类别可核对、且未违反排除条件的候选。');
  assert.equal(mixed, nature.replaceAll('开封', '南京'));

  const stale = blob('开封', '已按本轮需求筛选杭州的景点。推荐自然风光候选。');
  assert.match(stale, /开封/);
  assert.doesNotMatch(stale, /杭州|杭帮菜/);

  const food = blob('开封', '在开封找到这些餐饮地点（高德地图数据，已跳过肯德基、麦当劳、必胜客等全国连锁快餐。营业情况请出发前确认）：\n1. 第一楼');
  assert.match(food, /开封的本地特色餐厅/);
  assert.match(food, /开封的本地小吃/);
  assert.doesNotMatch(food, /杭州|杭帮菜|室内博物馆/);

  const lodging = blob('上海', '高德地图显示上海有以下住宿地点（房价、房态和营业情况请向商家确认）：\n1. 测试酒店');
  assert.match(lodging, /上海的住宿/);
  assert.doesNotMatch(lodging, /杭帮|开封/);

  assert.deepEqual(suggestionChips('', '已筛选景点'), []);
  assert.deepEqual(suggestionChips('开封', '我只能协助解答旅行相关问题，请告诉我你的旅行需求。'), []);
  const hangzhou = blob('杭州', '已按本轮需求筛选杭州的景点。');
  assert.match(hangzhou, /杭州/);
  assert.doesNotMatch(hangzhou, /杭帮菜/);
  assert.doesNotMatch(blob('南京', success), /自然风光/);

  const confirmed = blob('南京', success, {
    query: '南京有什么自然风光',
    criteria: { include: ['自然风光'], exclude: [], mode: 'strict' },
    searchKeywords: ['自然风光', '公园'],
  });
  assert.match(confirmed, /再找南京自然风光/);
  assert.match(confirmed, /室内博物馆/);
  assert.doesNotMatch(confirmed, /杭州/);

  const mixedContext = blob('开封', success, {
    query: '杭州的自然风光和人文历史都可以',
    criteria: { include: ['自然风光', '人文历史'], exclude: [], mode: 'prefer' },
    searchKeywords: ['杭州', '公园'],
  });
  assert.match(mixedContext, /再找开封自然风光/);
  assert.doesNotMatch(mixedContext, /杭州|南京/);

  const indoor = blob('南京', success, {
    query: '推荐博物馆',
    criteria: { include: ['博物馆'], exclude: [], mode: 'strict' },
    searchKeywords: ['博物馆', '公园'],
  });
  assert.doesNotMatch(indoor, /自然风光/);
  assert.match(indoor, /室内博物馆/);

  const culture = blob('南京', success, {
    query: '人文历史优先',
    criteria: { include: ['人文历史'], exclude: [], mode: 'prefer' },
    searchKeywords: ['博物馆'],
  });
  assert.doesNotMatch(culture, /自然风光/);

  const preferQuery = blob('南京', success, {
    query: '自然风光优先，人文也可以',
    criteria: { include: ['人文历史'], exclude: [], mode: 'prefer' },
    searchKeywords: ['博物馆'],
  });
  assert.match(preferQuery, /再找南京自然风光/);
  assert.doesNotMatch(preferQuery, /杭州/);
});

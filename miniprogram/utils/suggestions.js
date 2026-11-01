/** 文案与 shared/suggestionChips.ts 保持一致。图标只用小程序里已有的 ink 资源。小程序打包根在 miniprogram/，不能直接引用仓库外的 TS。 */

const NATURE = /自然|风光|风景|公园/;

function contextWantsNature(context) {
  if (!context) return false;
  const criteria = context.criteria || {};
  const include = Array.isArray(criteria.include) ? criteria.include : [];
  const natureInclude = include.some(item => NATURE.test(String(item || '')));
  if (natureInclude && include.every(item => NATURE.test(String(item || '')))) return true;
  return criteria.mode === 'prefer' && (natureInclude || NATURE.test(String(context.query || '')));
}

function suggestionChips(destination, assistantText, context) {
  const city = String(destination || '').trim();
  const text = String(assistantText || '').trim();
  if (!city || !text) return [];
  if (/只能协助解答旅行相关问题/.test(text)) return [];
  if (/餐饮地点|全国连锁快餐|本地餐厅/.test(text)) {
    return [
      { icon: 'restaurant', label: '再看看' + city + '本地餐馆', text: '继续推荐' + city + '的本地特色餐厅，不要全国连锁快餐' },
      { icon: 'refresh', label: '换一批' + city + '小吃', text: '换一批' + city + '的本地小吃' },
    ];
  }
  if (/住宿地点/.test(text)) {
    return [
      { icon: 'refresh', label: '换一批' + city + '住宿', text: '换一批' + city + '的住宿' },
      { icon: 'refresh', label: '看看' + city + '景点', text: '推荐' + city + '适合游览的景点' },
    ];
  }
  const nature = NATURE.test(text) || contextWantsNature(context);
  if (!/景点|候选地点|自然|风光|风景|公园|博物馆/.test(text) && !nature) return [];
  const chips = [];
  if (nature) {
    chips.push({ icon: 'refresh', label: '再找' + city + '自然风光', text: '继续推荐' + city + '的自然风光' });
  }
  chips.push({ icon: 'refresh', label: '换成' + city + '室内场馆', text: '更换为' + city + '的室内博物馆或展览' });
  chips.push({ icon: 'restaurant', label: '补充' + city + '本地美食', text: '补充' + city + '的本地特色餐厅，不要全国连锁快餐' });
  return chips.slice(0, 3);
}

module.exports = { suggestionChips };

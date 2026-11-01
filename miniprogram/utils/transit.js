// 与 shared/transit.ts 保持一致；小程序只能引用自己的打包目录。
function transitLineMode(route, index) {
  return (route.lineModes && route.lineModes[index])
    || (/地铁|轻轨|轨道交通|\bmetro\b|\bsubway\b/i.test((route.lines || [])[index] || '') ? 'subway' : 'bus');
}

function transitChoices(transit) {
  if (!transit) return {};
  if (transit.alternatives) return transit.alternatives;
  return (transit.lines || []).some((_, i) => transitLineMode(transit, i) === 'subway')
    ? { subway: transit } : { bus: transit };
}

module.exports = { transitLineMode, transitChoices };

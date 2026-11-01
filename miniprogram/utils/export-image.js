const { transitChoices } = require('./transit');
const { fmtRange } = require('./format');

// 每天一张图，保留景点、时间、实用信息与交通，避免长行程生成超长画布。
function exportPages(trip, draft, catalog) {
  return (draft.days || []).map(day => {
    const lines = [];
    let y = 36;
    function add(text, size, color, gap) {
      const chars = Array.from(String(text || ''));
      if (!chars.length) return;
      const max = Math.floor(327 / size);
      while (chars.length) {
        lines.push({ text: chars.splice(0, max).join(''), size, color, y });
        y += size + 8;
      }
      y += gap || 0;
    }
    const title = ((trip.state && trip.state.destination) || '行程') + ' · 第 ' + day.day + ' 天';
    add(title, 22, '#315d59', 4);
    if (day.weather) add('天气：' + day.weather.text + ' ' + day.weather.tempMin + '–' + day.weather.tempMax + '℃', 14, '#667772', 4);
    if (day.summary) add(day.summary, 15, '#344944', 8);
    const stops = day.stops && day.stops.length ? day.stops : (day.attractionIds || []).map(attractionId => ({ attractionId }));
    stops.forEach((stop, i) => {
      const a = catalog[stop.attractionId] || {};
      add((i + 1) + '. ' + (a.name || (day.names || [])[i] || '景点'), 18, '#315d59', 2);
      if (stop.arrive && stop.stayMin != null) add('时间：' + fmtRange(stop.arrive, stop.stayMin), 14, '#344944');
      if (a.address) add('地址：' + a.address, 14, '#344944');
      [['特色', a.highlights], ['建议游玩', a.duration], ['门票预约', a.ticket], ['开放时间', a.openHours], ['贴士', a.tips]].forEach(([label, field]) => {
        if (field && field.value) add(label + '：' + field.value, 14, '#344944');
      });
      const leg = (day.legs || [])[i];
      if (leg && i < stops.length - 1) {
        const choices = transitChoices(leg.transit);
        [['subway', '地铁优先'], ['bus', '公交方案']].forEach(([mode, label]) => {
          const route = choices[mode];
          if (route) add(label + '：' + route.lines.join(' → ') + '，约 ' + route.durationMin + ' 分钟', 14, '#667772');
        });
        if (!leg.transit) add(leg.transitStatus === 'unavailable' ? '公共交通方案暂时无法查询' : '未查询到可用公共交通方案', 14, '#667772');
        if (leg.driving) add('自驾：约 ' + leg.driving.durationMin + ' 分钟，' + leg.driving.distanceKm + ' 公里', 14, '#667772');
      }
      y += 12;
    });
    add('出行前请以景区官方信息为准', 12, '#778680');
    return { lines, height: y + 16 };
  });
}
module.exports = { exportPages };

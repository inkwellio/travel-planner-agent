/** 与 Web 手机版同一套文案和分组。now 可注入，方便测试。 */

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function bucketOf(iso, now) {
  const d = new Date(iso);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= start) return '今天';
  const week = new Date(start);
  week.setDate(week.getDate() - 7);
  return d >= week ? '本周' : '更早';
}

function stamp(trip) {
  const d = new Date(trip.updatedAt);
  const draft = (trip.versions || []).find(v => v.version === trip.activeVersion);
  const days = draft && draft.days ? draft.days.length : 0;
  return pad(d.getMonth() + 1) + '.' + pad(d.getDate()) + (days ? ' · ' + days + '天' : '');
}

function haystack(trip) {
  const state = trip.state || {};
  const names = [];
  (trip.versions || []).forEach(v => {
    (v.days || []).forEach(day => { (day.names || []).forEach(n => names.push(n)); });
  });
  return [trip.title, state.destination, state.companions].concat(state.preferences || [], names).join(' ').toLowerCase();
}

function groupTrips(rows, keyword, now) {
  const kw = String(keyword || '').trim().toLowerCase();
  const shown = kw ? rows.filter(row => String(row.hay || '').indexOf(kw) >= 0) : rows.slice();
  const names = ['今天', '本周', '更早'];
  const groups = [];
  names.forEach(name => {
    const items = shown.filter(row => row.bucket === name);
    if (items.length) groups.push({ name, rows: items });
  });
  return { groups, miss: !!kw && !shown.length, empty: !kw && !shown.length };
}

function tripRows(trips, now) {
  const clock = now || new Date();
  return (trips || []).map(t => ({
    id: t.id,
    title: t.title || '未命名行程',
    stamp: stamp(t),
    draft: '',
    bucket: bucketOf(t.updatedAt, clock),
    hay: haystack(t),
  }));
}

function fmtRange(arrive, stay) {
  const parts = String(arrive || '00:00').split(':');
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  const end = h * 60 + m + (Number(stay) || 0);
  return arrive + ' - ' + pad(Math.floor(end / 60) % 24) + ':' + pad(end % 60);
}

function hostOf(url) {
  const m = /^https?:\/\/([^/?#]+)/i.exec(url || '');
  return m ? m[1].replace(/^www\./, '') : '';
}

function monthDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return (d.getMonth() + 1) + '月' + d.getDate() + '日更新';
}

/** web：来源链接；llm/sample：仅供参考；amap/manual 不标。 */
function refTag(field, sampleText) {
  if (!field || !field.source) return null;
  if (field.source === 'web' && field.sourceUrl) {
    const md = monthDay(field.fetchedAt);
    const title = String(field.sourceTitle || hostOf(field.sourceUrl)).slice(0, 12);
    return { kind: 'web', text: '来源：' + title + (md ? ' · ' + md : ''), url: field.sourceUrl };
  }
  if (field.source === 'llm' || field.source === 'sample') {
    return { kind: 'muted', text: sampleText || '仅供参考', url: '' };
  }
  return null;
}

function shortName(name) {
  return String(name || '').split('·')[0];
}

function selectionFrom(trip) {
  const messages = (trip && trip.messages) || [];
  let last = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (Array.isArray(messages[i].recommendations)) { last = messages[i]; break; }
  }
  const selected = {};
  ((last && last.recommendations) || []).forEach(id => { selected[id] = true; });
  return selected;
}

module.exports = {
  bucketOf, stamp, haystack, groupTrips, tripRows, fmtRange, refTag, shortName, selectionFrom,
};

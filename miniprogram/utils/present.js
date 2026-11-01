const { transitChoices, transitLineMode } = require('./transit');
const { fmtRange, refTag, shortName, tripRows, selectionFrom } = require('./format');
const { suggestionChips } = require('./suggestions');

function activeDraft(trip) {
  if (!trip) return null;
  const versions = trip.versions || [];
  for (let i = 0; i < versions.length; i++) {
    if (versions[i].version === trip.activeVersion) return versions[i];
  }
  return null;
}

function photoOf(a) {
  const photos = (a && a.photos) || [];
  for (let i = 0; i < photos.length; i++) {
    if (/^https?:\/\//i.test(photos[i])) return photos[i];
  }
  return '';
}

function recCard(a, checked) {
  const shown = [a.highlights, a.duration, a.audience].filter(Boolean);
  const needRef = shown.some(f => f.source === 'llm' || f.source === 'sample');
  const hasWeb = shown.some(f => f.source === 'web');
  let audience = '';
  if (a.audience && a.audience.value) {
    const parts = String(a.audience.value).split('｜');
    audience = parts[1] || parts[0];
  }
  return {
    id: a.id,
    name: a.name,
    tag: (a.tags && a.tags[0]) || '',
    sample: !!a.sample,
    highlights: a.highlights ? a.highlights.value : '',
    duration: a.duration ? a.duration.value : '',
    audience,
    rating: a.rating ? Number(a.rating).toFixed(1) : '',
    indoor: !!a.indoor,
    photo: photoOf(a),
    refLabel: needRef ? '仅供参考' : (hasWeb ? '含网页出处' : ''),
    checked: !!checked,
  };
}

function line(label, field, strong) {
  if (!field || !field.value) return null;
  return { label, value: field.value, strong: !!strong, ref: refTag(field) };
}

function stopCard(a, index, time, editable, total) {
  const boxes = [];
  const play = [line('建议游玩', a.duration, true), line('最佳时段', a.bestTime, false)].filter(Boolean);
  if (play.length) boxes.push({ key: 'play', icon: 'timer', title: '游玩与最佳时段', tone: 'primary', lines: play });
  const ticket = [line('门票预约', a.ticket, true), line('开放时间', a.openHours, false), line('闭馆日', a.closedDays, false)].filter(Boolean);
  if (ticket.length) boxes.push({ key: 'ticket', icon: 'confirmation_number', title: '门票与开放', tone: 'primary', lines: ticket });
  if (a.audience && a.audience.value) boxes.push({ key: 'who', icon: 'accessible_forward', title: '适合人群与体力', tone: 'accent', lines: [line('适合', a.audience, true)] });
  if (a.food && a.food.value) boxes.push({ key: 'food', icon: 'restaurant', title: '周边美食推荐', tone: 'muted', lines: [line('推荐', a.food, true)] });
  return {
    id: a.id,
    index,
    time,
    name: a.name,
    tag: (a.tags && a.tags[0]) || '',
    sample: !!a.sample,
    rating: a.rating ? Number(a.rating).toFixed(1) : '',
    address: a.address || '',
    phone: a.phone || '',
    highlights: a.highlights ? a.highlights.value : '',
    highlightRef: refTag(a.highlights),
    photo: photoOf(a),
    indoor: !!a.indoor,
    boxes,
    tips: a.tips ? a.tips.value : '',
    tipsRef: refTag(a.tips),
    canUp: editable && index > 0,
    canDown: editable && index < total - 1,
    canRemove: editable && total > 1,
  };
}

function legCard(leg, catalog, index) {
  if (!leg) return null;
  const from = shortName((catalog[leg.fromId] || {}).name);
  const to = shortName((catalog[leg.toId] || {}).name);
  const t = leg.transit;
  const d = leg.driving;
  const choices = transitChoices(t);
  const describe = (route, mode) => route ? {
    label: mode === 'subway' ? '地铁优先' + ((route.lineModes || []).includes('bus') ? '（含公交接驳）' : '') : '公交方案',
    walk: route.walkMeters ? '步行约 ' + route.walkMeters + ' 米' : '',
    steps: (route.lines || []).map((lineName, i) => ({
      key: i + '-' + lineName, line: lineName,
      subway: transitLineMode(route, i) === 'subway',
      bus: transitLineMode(route, i) === 'bus',
      transfer: (route.transfers || [])[i] || '',
    })),
    to, duration: route.durationMin, transfers: (route.transfers || []).length,
    fare: route.fare == null ? '' : Number(route.fare).toFixed(2),
    ref: refTag(route, '示例估算·仅供参考'),
  } : null;
  const subway = describe(choices.subway, 'subway');
  const bus = describe(choices.bus, 'bus');
  const transit = subway || bus;
  const unavailable = mode => leg.transitStatus === 'unavailable' || (t && t.availability && t.availability[mode] === 'unavailable');
  const missing = mode => unavailable(mode)
    ? (mode === 'subway' ? '地铁' : '公交') + '方案暂时无法查询，请稍后重试。'
    : '未查询到可用' + (mode === 'subway' ? '地铁' : '公交') + '方案。';
  let driving = null;
  if (d) {
    driving = {
      duration: d.durationMin,
      distance: d.distanceKm,
      tolls: d.tolls,
      parking: d.parking || '',
      ref: refTag(d, '示例估算·仅供参考'),
    };
  }
  return {
    key: 'leg-' + index + '-' + (leg.fromId || '') + '-' + (leg.toId || ''),
    from,
    to,
    distance: d && d.distanceKm ? d.distanceKm : '',
    transit, subway, bus,
    preferredMode: subway ? 'subway' : 'bus',
    missing: { subway: missing('subway'), bus: missing('bus') },
    transitNote: !subway && bus ? (unavailable('subway') ? '地铁方案暂时无法查询，当前先展示公交。' : '未查询到可用地铁方案，当前优先展示公交。') : '',
    driving,
  };
}

function buildMessages(messages, catalog, selected, destination) {
  let lastId = '';
  let lastAssistant = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (!lastId && Array.isArray(messages[i].recommendations)) lastId = messages[i].id;
    if (lastAssistant < 0 && messages[i].role !== 'user') lastAssistant = i;
  }
  return messages.map((m, i) => ({
    id: m.id,
    role: m.role,
    text: m.text || '',
    mine: m.role === 'user',
    cards: (m.recommendations || []).map(id => catalog[id]).filter(Boolean).map(a => recCard(a, selected[a.id])),
    showActions: m.id === lastId,
    actions: i === lastAssistant ? suggestionChips(destination, m.text || '', m.recommendationContext) : [],
  }));
}

function mapOf(draft, catalog, dayIdx) {
  const markers = [];
  const polyline = [];
  const include = [];
  let n = 1;
  const days = draft.days || [];
  const order = [];
  days.forEach((d, di) => { if (di !== dayIdx) order.push(di); });
  if (days[dayIdx]) order.push(dayIdx);
  order.forEach(di => {
    const day = days[di];
    const ids = (day.stops && day.stops.length) ? day.stops.map(s => s.attractionId) : (day.attractionIds || []);
    const pts = ids.map(id => catalog[id]).filter(a => a && a.location && typeof a.location.lat === 'number');
    const on = di === dayIdx;
    const line = [];
    pts.forEach((a, i) => {
      const num = Math.min(i + 1, 12);
      markers.push({
        id: n,
        latitude: a.location.lat,
        longitude: a.location.lng,
        iconPath: '/assets/pins/' + (on ? 'on-' : 'off-') + num + '.png',
        width: 28,
        height: 28,
        anchor: { x: 0.5, y: 0.5 },
        zIndex: on ? 2 : 1,
        callout: {
          content: shortName(a.name),
          display: 'BYCLICK',
          padding: 8,
          borderRadius: 8,
          bgColor: '#2E3532',
          color: '#F5F2EC',
          fontSize: 12,
        },
      });
      n += 1;
      line.push({ latitude: a.location.lat, longitude: a.location.lng });
      include.push({ latitude: a.location.lat, longitude: a.location.lng });
    });
    if (line.length > 1) {
      polyline.push({ points: line, color: on ? '#5B7B7A' : '#8A8F8B', width: on ? 5 : 3 });
    }
  });
  if (!include.length) return { show: false, lat: 30.25, lng: 120.15, scale: 12, markers: [], polyline: [], include: [] };
  let lat = 0; let lng = 0;
  include.forEach(p => { lat += p.latitude; lng += p.longitude; });
  return {
    show: true,
    lat: lat / include.length,
    lng: lng / include.length,
    scale: 12,
    markers,
    polyline,
    include,
  };
}

function buildDraft(trip, catalog, dayIdx, streaming, busy) {
  const city = trip && trip.state ? String(trip.state.destination || '').trim() : '';
  const draft = activeDraft(trip);
  if (!draft) {
    return {
      empty: true,
      city,
      needCity: !city,
      overviewTitle: city ? city + '概览' : '先选择目的地',
      overviewHint: city ? '在聊天里勾选景点，点「生成路线」' : '告诉我要去哪座城市，地图会显示在这里',
    };
  }
  const days = draft.days || [];
  const idx = days.length ? Math.min(Math.max(dayIdx || 0, 0), days.length - 1) : 0;
  const day = days[idx];
  const editable = !!(draft.complete && !streaming && !busy);
  const versions = (trip.versions || []).slice().sort((a, b) => a.version - b.version);
  const versionLabels = versions.map(v => (v.note || '行程方案') + ' · ' + new Date(v.createdAt).toLocaleString() + (v.complete ? '' : '（未完成）'));
  let versionIndex = 0;
  versions.forEach((v, i) => { if (v.version === draft.version) versionIndex = i; });
  const totalKm = days.reduce((sum, d) => sum + (d.legs || []).reduce((s, l) => s + ((l.driving && l.driving.distanceKm) || 0), 0), 0);
  const alerts = [];
  days.forEach(d => {
    if (!d.weather || !d.weather.rainy) return;
    const alts = (d.indoorAlternatives || []).map(id => (catalog[id] || {}).name).filter(Boolean);
    alerts.push({
      day: d.day,
      text: '第 ' + d.day + ' 天预报「' + d.weather.text + '」，室外景点可替换为室内备选：' + (alts.length ? alts.join('、') : '暂无'),
      meta: (d.weather.date || '') + ' · ' + d.weather.tempMin + '–' + d.weather.tempMax + '℃',
      ref: refTag(d.weather, '示例天气'),
    });
  });
  const tabs = days.map((d, i) => ({
    day: d.day,
    on: i === idx,
    label: 'Day ' + d.day + (d.weather ? ' · ' + d.weather.text : '') + ' (' + (d.attractionIds || []).length + '个地点)' + (d.status === 'skeleton' ? ' …' : ''),
  }));
  let body = null;
  if (day && day.status === 'skeleton') {
    body = {
      skeleton: true,
      day: day.day,
      names: (day.names || []).map((name, i) => ({ key: i + '-' + name, name })),
    };
  } else if (day) {
    const ids = (day.stops && day.stops.length) ? day.stops.map(s => s.attractionId) : (day.attractionIds || []);
    const stops = [];
    ids.forEach((id, i) => {
      const a = catalog[id];
      if (!a) return;
      const slot = (day.stops || []).find(s => s.attractionId === id);
      const time = slot ? fmtRange(slot.arrive, slot.stayMin) : '';
      const card = stopCard(a, stops.length, time, editable, ids.length);
      card.leg = legCard((day.legs || [])[i], catalog, i);
      stops.push(card);
    });
    body = { skeleton: false, day: day.day, summary: day.summary || '', editable, stops };
  }
  return {
    empty: false,
    city,
    heading: (city ? city + '·' : '') + days.length + '天路线',
    version: draft.version,
    versionLabels,
    versionIndex,
    editable,
    streaming: !!streaming,
    totalKm: totalKm > 0 ? totalKm.toFixed(1) : '',
    alerts,
    tabs,
    body,
    map: mapOf(draft, catalog, idx),
  };
}

function sheetTitle(draft, streaming) {
  if (!draft || draft.empty) return '规划结果';
  return '规划结果' + (streaming ? '（生成中）' : '');
}

function footer(sample) {
  return (sample ? '景点为本地示例数据 · ' : '') + '不提供订票与支付 · 出行前请以景区官方信息为准';
}

function derive(input) {
  const trip = input.trip;
  const catalog = input.catalog || {};
  const selected = input.selected || {};
  const notices = input.notices || [];
  const messages = ((trip && trip.messages) || []).concat(notices);
  const draft = trip ? buildDraft(trip, catalog, input.dayIdx || 0, input.streaming, input.busy) : null;
  const state = (trip && trip.state) || {};
  return {
    loading: !!input.loading,
    loadError: input.loadError || '',
    offline: !!input.offline,
    modeText: input.modeText || '',
    messages: buildMessages(messages, catalog, selected, state.destination || ''),
    busy: !!input.busy,
    streaming: !!input.streaming,
    cooldown: input.cooldown || 0,
    selectedCount: Object.keys(selected).filter(id => selected[id]).length,
    hasRecommendations: messages.some(m => m.recommendations && m.recommendations.length),
    sample: input.sample !== false,
    footer: footer(input.sample !== false),
    draft,
    sheetTitle: sheetTitle(draft, input.streaming),
    tripRows: tripRows(input.trips || []),
    activeId: trip ? trip.id : '',
    deletingId: input.deletingId || '',
    state: {
      destination: state.destination || '',
      days: state.days || 2,
      preferences: state.preferences || [],
      prefsLabel: (state.preferences || []).join('·') || '偏好',
      pace: state.pace || '适中',
    },
    hasTrip: !!trip,
    canPlan: !!(state.destination && String(state.destination).trim()),
  };
}

module.exports = { derive, activeDraft, selectionFrom, buildDraft };

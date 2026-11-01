/**
 * Local smoke scenarios against running server (PORT from .env, default 8787).
 * Run: node scripts/local-scenario-smoke.mjs
 */
import { readFileSync } from 'node:fs';

function chipsOf(destination, assistantText) {
  const city = String(destination || '').trim();
  const text = String(assistantText || '').trim();
  if (!city || !text) return [];
  if (/只能协助解答旅行相关问题/.test(text)) return [];
  if (/餐饮地点|全国连锁快餐|本地餐厅/.test(text)) {
    return [
      { label: '再看看' + city + '本地餐馆', text: '继续推荐' + city + '的本地特色餐厅，不要全国连锁快餐' },
      { label: '换一批' + city + '小吃', text: '换一批' + city + '的本地小吃' },
    ];
  }
  if (/住宿地点/.test(text)) {
    return [
      { label: '换一批' + city + '住宿', text: '换一批' + city + '的住宿' },
      { label: '看看' + city + '景点', text: '推荐' + city + '适合游览的景点' },
    ];
  }
  if (!/景点|候选地点|自然|风光|风景|公园|博物馆/.test(text)) return [];
  const chips = [];
  if (/自然|风光|风景|公园/.test(text)) {
    chips.push({ label: '再找' + city + '自然风光', text: '继续推荐' + city + '的自然风光' });
  }
  chips.push({ label: '换成' + city + '室内场馆', text: '更换为' + city + '的室内博物馆或展览' });
  chips.push({ label: '补充' + city + '本地美食', text: '补充' + city + '的本地特色餐厅，不要全国连锁快餐' });
  return chips.slice(0, 3);
}

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);
const BASE = `http://127.0.0.1:${env.PORT || 8787}`;

async function json(method, path, body, token) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!r.ok) {
    throw new Error(`${method} ${path} ${r.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

function lastAssistant(trip) {
  return [...(trip.messages || [])].reverse().find(m => m.role === 'assistant');
}

function pass(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

async function newTrip(token, state = {}) {
  return json('POST', '/api/trips', { state }, token);
}

async function chat(token, tripId, message) {
  return json('POST', `/api/trips/${tripId}/chat`, { message }, token);
}

const results = [];

async function run() {
  const health = await json('GET', '/api/health');
  results.push(
    pass(
      'health',
      health.ok && health.search === 'bocha' && health.map === 'amap' && health.llm === 'deepseek',
      JSON.stringify(health),
    ),
  );

  const { token } = await json('POST', '/api/session');

  {
    const trip = await newTrip(token, {
      destination: '南京',
      days: 1,
      preferences: ['自然风光', '人文历史', '轻松节奏'],
    });
    const out = await chat(
      token,
      trip.id,
      '请按规划参数推荐景点。南京、1天，偏好自然风光、人文历史，轻松节奏。',
    );
    const a = lastAssistant(out);
    const text = a?.text || '';
    const hasRecs = (a?.recommendations?.length || 0) > 0;
    const evidenceFail = /资料不足以确认/.test(text);
    results.push(
      pass(
        '南京·自然+人文+轻松 应出推荐',
        hasRecs && !evidenceFail,
        hasRecs ? `recs=${a.recommendations.length}; ${text.slice(0, 80)}` : text.slice(0, 160),
      ),
    );
    const chips = chipsOf('南京', text);
    results.push(
      pass(
        '南京追问芯片含南京且无杭州',
        chips.length > 0 &&
          chips.every(c => c.label.includes('南京') || c.text.includes('南京')) &&
          !chips.some(c => /杭州|杭帮/.test(c.label + c.text)),
        chips.map(c => c.label).join(' / ') || '(无芯片)',
      ),
    );
  }

  {
    const trip = await newTrip(token, { destination: '开封', days: 2, preferences: ['自然风光'] });
    const out = await chat(token, trip.id, '开封有什么自然风光推荐？');
    const a = lastAssistant(out);
    const text = a?.text || '';
    const hasRecs = (a?.recommendations?.length || 0) > 0;
    const evidenceFail = /资料不足以确认/.test(text);
    results.push(
      pass(
        '开封自然风光 应出推荐或地图补位',
        hasRecs && !evidenceFail,
        hasRecs ? `recs=${a.recommendations.length}; ${text.slice(0, 80)}` : text.slice(0, 160),
      ),
    );
    const chips = chipsOf('开封', text);
    results.push(
      pass(
        '开封芯片无杭帮菜',
        !chips.some(c => /杭州|杭帮/.test(c.label + c.text)),
        chips.map(c => c.label).join(' / ') || '(无芯片)',
      ),
    );
  }

  {
    const trip = await newTrip(token, { destination: '上海', days: 1, preferences: ['自然风光'] });
    const out = await chat(token, trip.id, '上海有什么自然风光？');
    const a = lastAssistant(out);
    const text = a?.text || '';
    const hasRecs = (a?.recommendations?.length || 0) > 0;
    results.push(
      pass(
        '上海自然风光 应出推荐',
        hasRecs && !/资料不足以确认/.test(text),
        hasRecs ? `recs=${a.recommendations.length}; ${text.slice(0, 80)}` : text.slice(0, 160),
      ),
    );
  }

  {
    const trip = await newTrip(token, { destination: '杭州', days: 2 });
    const out = await chat(token, trip.id, '杭州有什么好吃的');
    const a = lastAssistant(out);
    const text = a?.text || '';
    const chainHit = /肯德基|麦当劳|必胜客|星巴克|汉堡王/.test(text);
    const foodish = /餐饮|餐厅|小吃|美食|菜/.test(text);
    results.push(
      pass(
        '杭州美食 默认不出现全国连锁快餐',
        foodish && !chainHit,
        text.slice(0, 160),
      ),
    );
    const chips = chipsOf('杭州', text);
    results.push(
      pass(
        '杭州美食芯片跟目的地',
        chips.length > 0 && chips.every(c => c.text.includes('杭州')) && !chips.some(c => /杭帮菜/.test(c.label)),
        chips.map(c => c.label).join(' / ') || '(无芯片)',
      ),
    );
  }

  {
    const trip = await newTrip(token, { destination: '江苏', days: 3 });
    const out = await chat(token, trip.id, '帮我推荐景点');
    const a = lastAssistant(out);
    const text = a?.text || '';
    results.push(
      pass(
        '省级目的地江苏 应追问城市',
        /城市|哪座|具体|南京|苏州|无锡/.test(text) && !(a?.recommendations?.length > 0),
        text.slice(0, 160),
      ),
    );
  }

  {
    const trip = await newTrip(token);
    const out = await chat(token, trip.id, '帮我写一段 Python 排序代码');
    const a = lastAssistant(out);
    results.push(
      pass('非旅行问题 应拒答', /只能协助解答旅行/.test(a?.text || ''), (a?.text || '').slice(0, 80)),
    );
  }

  {
    const trip = await newTrip(token, { days: 2 });
    const out = await chat(token, trip.id, '推荐几个景点');
    const a = lastAssistant(out);
    const text = a?.text || '';
    results.push(
      pass(
        '无目的地 应先要城市',
        /目的地|城市|去哪|哪里/.test(text) && !(a?.recommendations?.length > 0),
        text.slice(0, 160),
      ),
    );
  }

  {
    const trip = await newTrip(token, { destination: '南京', days: 2 });
    const out = await chat(token, trip.id, '南京附近有什么靠谱的住宿推荐');
    const a = lastAssistant(out);
    const text = a?.text || '';
    results.push(
      pass(
        '南京住宿 应有住宿回复',
        /住宿|酒店|民宿|客栈/.test(text),
        text.slice(0, 160),
      ),
    );
  }

  const failed = results.filter(x => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

run().catch(err => {
  console.error('FATAL', err);
  process.exit(2);
});

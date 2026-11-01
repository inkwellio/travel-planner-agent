import type { ChatMessage } from '../../shared/types.js';
import { parseDestinationIntent } from './destinationIntent.js';
import { isFoodRequest } from './food.js';
import { safeSourceUrl, safeText } from './modelSafety.js';
import { isQuotaError } from './limits.js';
import type { SearchProvider } from './search/SearchProvider.js';

export type TravelIntent = 'food' | 'information' | 'sightseeing' | 'clarify';
const INFO = /土特产|特产|伴手礼|纪念品|手信|购物|商场|买什么|怎么买|哪里买|酒店|住宿|民宿|住哪里|哪里住|住哪|交通|地铁|公交|高铁|火车|机场|机票|打车|自驾|停车|天气|气温|穿什么|门票|票价|多少钱|开放时间|营业时间|预约|签证|护照|预算|花费|费用|安全吗|治安|注意事项|风俗|禁忌|厕所|洗手间|无障碍|行李|寄存/;
const SIGHTSEEING = /景点|景区|风景|风光|游玩|旅游|旅行|行程|路线|攻略|怎么玩|怎么逛|玩几天|逛西湖|博物馆|茶馆|带爸妈|带老人|带小孩/;
const FOLLOWUP = /^(?:附近呢|那里呢|还有吗|还有呢|还有什么|再推荐几个|换一批|换一个|哪个好|为什么|怎么办|详细说说)[？?！!。\s]*$/;

/** @deprecated 旧版解析接口；聊天入口使用 understandTravelRequest，不调用此函数。 */
export function travelIntent(message: string, history: ChatMessage[], destination: string): { intent: TravelIntent; query: string } {
  const text = message.trim();
  if (FOLLOWUP.test(text)) {
    const last = [...history].reverse().find(m => m.role === 'user');
    if (!last || FOLLOWUP.test(last.text.trim())) return { intent: 'clarify', query: text };
    if (/附近|那里/.test(text)) return { intent: 'clarify', query: text };
    const previous = travelIntent(last.text, [], destination);
    return { intent: previous.intent, query: `${last.text} ${text}` };
  }
  // 特产等信息问题即使含“好吃”，也不能降级成餐厅或景点推荐。
  if (INFO.test(text)) return { intent: 'information', query: text };
  if (isFoodRequest(text)) return { intent: 'food', query: text };
  if (SIGHTSEEING.test(text) || /[一二两三四五六七八九十\d]+\s*[天日](?!气)/.test(text)) return { intent: 'sightseeing', query: text };
  const place = parseDestinationIntent(text, { destination });
  if (place.kind === 'ambiguous' || (place.kind === 'candidate' && (place.explicit || /^(?:我想去|想去|去|到|前往)/.test(text) || /^[\u4e00-\u9fff]{2,4}$/.test(text)))) return { intent: 'sightseeing', query: text };
  return { intent: 'clarify', query: text };
}

/** 只展示搜索服务返回的摘要及出处，不让模型执行或改写网页内容。 */
export async function lookupTravelInformation(city: string, question: string, search: SearchProvider): Promise<{ text: string; available: boolean }> {
  if (search.name === 'mock') return { available: false, text: `尚未配置旅行相关资料搜索，暂时无法查询${city}的相关资料。` };
  try {
    const found = await search.search(`${city} ${question}`, 5);
    const results = found.flatMap(item => {
      const title = typeof item.title === 'string' ? item.title.trim().replace(/\s+/g, ' ') : '';
      const snippet = typeof item.snippet === 'string' ? item.snippet.trim().replace(/\s+/g, ' ') : '';
      if (!safeSourceUrl(item.url) || !safeText(title, 200) || !safeText(snippet, 6000)) return [];
      return [{ title: title.slice(0, 100), snippet: snippet.slice(0, 220), url: item.url }];
    }).slice(0, 3);
    if (!results.length) return { available: false, text: `暂时没有查到${city}的相关资料。你可以换个说法或指定具体地点后再试。` };
    return { available: true, text: `找到以下搜索结果，请核对相关性、来源和更新时间：\n${results.map((item, i) => `${i + 1}. ${item.title}\n${item.snippet}\n来源：${item.url}`).join('\n\n')}` };
  } catch (e) {
    if (isQuotaError(e)) throw e;
    return { available: false, text: `暂时无法查询${city}的相关资料，请稍后再试。` };
  }
}

/** 原有字符串接口兼容层。 */
export async function answerTravelInformation(city: string, question: string, search: SearchProvider): Promise<string> {
  return (await lookupTravelInformation(city, question, search)).text;
}

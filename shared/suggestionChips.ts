import type { ChatMessage } from './types.js';

export interface SuggestionChip {
  icon: 'refresh' | 'restaurant' | 'landscape' | 'museum';
  label: string;
  text: string;
}

const NATURE = /自然|风光|风景|公园/;

/** 本轮推荐是否在找自然风光。prefer 里只要包含自然也算，避免成功回复没写出「自然」就丢掉芯片。 */
function contextWantsNature(context?: ChatMessage['recommendationContext'] | null): boolean {
  if (!context) return false;
  const include = context.criteria?.include ?? [];
  const natureInclude = include.some(item => NATURE.test(item));
  if (natureInclude && include.every(item => NATURE.test(item))) return true;
  return context.criteria?.mode === 'prefer' && (natureInclude || NATURE.test(context.query ?? ''));
}

/**
 * 追问芯片使用当前行程目的地和最新一条助手回复。
 * 景点推荐可额外看本轮 recommendationContext，城市名只取目的地，不从回复或问题里的其他城市取词。
 */
export function suggestionChips(destination: string, assistantText: string, context?: ChatMessage['recommendationContext'] | null): SuggestionChip[] {
  const city = destination.trim();
  const text = assistantText.trim();
  if (!city || !text) return [];
  if (/只能协助解答旅行相关问题/.test(text)) return [];
  if (/餐饮地点|全国连锁快餐|本地餐厅/.test(text)) {
    return [
      { icon: 'restaurant', label: `再看看${city}本地餐馆`, text: `继续推荐${city}的本地特色餐厅，不要全国连锁快餐` },
      { icon: 'refresh', label: `换一批${city}小吃`, text: `换一批${city}的本地小吃` },
    ];
  }
  if (/住宿地点/.test(text)) {
    return [
      { icon: 'refresh', label: `换一批${city}住宿`, text: `换一批${city}的住宿` },
      { icon: 'landscape', label: `看看${city}景点`, text: `推荐${city}适合游览的景点` },
    ];
  }
  const nature = NATURE.test(text) || contextWantsNature(context);
  if (!/景点|候选地点|自然|风光|风景|公园|博物馆/.test(text) && !nature) return [];
  const chips: SuggestionChip[] = [];
  if (nature) {
    chips.push({ icon: 'landscape', label: `再找${city}自然风光`, text: `继续推荐${city}的自然风光` });
  }
  chips.push({ icon: 'museum', label: `换成${city}室内场馆`, text: `更换为${city}的室内博物馆或展览` });
  chips.push({ icon: 'restaurant', label: `补充${city}本地美食`, text: `补充${city}的本地特色餐厅，不要全国连锁快餐` });
  return chips.slice(0, 3);
}

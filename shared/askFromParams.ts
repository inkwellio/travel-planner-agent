import type { TripState } from './types.js';

/** 输入框为空、又没目的地时给用户看的提示。不要静默丢掉这次点击。 */
export const NEED_DESTINATION = '先填写目的地，再发送诉求';

/** 请求已经返回，但行程里仍然没有目的地，所以不会有推荐或路线。 */
export const NO_PLAN_WITHOUT_CITY = '目的地还是空的，所以这次没有推荐景点，也没有路线。请在上方规划参数里填写城市后再发送。';

export function hasDestination(state: { destination?: string } | null | undefined): boolean {
  return !!state?.destination?.trim();
}

/** 输入框为空时按可见参数生成诉求；旧行程的天数、节奏及同行人不带入景点检索。 */
export function messageFromParams(state: Pick<TripState, 'destination' | 'preferences'>): string {
  const city = state.destination.trim();
  const prefs = (state.preferences ?? []).map(p => p.trim()).filter(Boolean);
  const pref = prefs.length ? prefs.join('、') : '不限';
  return `请按规划参数推荐景点。${city}，偏好：${pref}。`;
}

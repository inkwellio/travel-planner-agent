import type { TripState } from '../../shared/types.js';
import { parseCategoryPreference } from './attractions/categories.js';

export class InputError extends Error {}

export function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InputError('请求参数必须是对象');
  return value as Record<string, unknown>;
}

/** 仅接受共享契约中的字段，校验完成后才允许写入行程。 */
export function statePatch(value: unknown): Partial<TripState> {
  const body = objectBody(value);
  const allowed = ['destination', 'days', 'preferences', 'pace', 'companions', 'categoryPreference', 'routeConstraints'];
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new InputError('包含未知的规划参数');
  const patch: Partial<TripState> = {};
  if ('destination' in body) {
    if (typeof body.destination !== 'string' || body.destination.length > 100) throw new InputError('目的地格式无效');
    patch.destination = body.destination.trim();
  }
  if ('days' in body) {
    if (typeof body.days !== 'number' || !Number.isInteger(body.days) || body.days < 1 || body.days > 7) throw new InputError('天数必须是 1 到 7 的整数');
    patch.days = body.days;
  }
  if ('preferences' in body) {
    if (!Array.isArray(body.preferences) || body.preferences.length > 20 || body.preferences.some(v => typeof v !== 'string' || !v.trim() || v.length > 50)) throw new InputError('偏好必须是有效的文字列表');
    patch.preferences = [...new Set((body.preferences as string[]).map(v => v.trim()))];
  }
  if ('pace' in body) {
    if (!['轻松', '适中', '紧凑'].includes(body.pace as string)) throw new InputError('节奏无效');
    patch.pace = body.pace as TripState['pace'];
  }
  if ('companions' in body) {
    if (!['独自', '情侣', '朋友', '带老人', '带小孩', '家庭'].includes(body.companions as string)) throw new InputError('同行人无效');
    patch.companions = body.companions as TripState['companions'];
  }
  if ('routeConstraints' in body) {
    const route = objectBody(body.routeConstraints);
    if (Object.keys(route).some(key => !['days', 'pace'].includes(key))) throw new InputError('路线要求包含未知字段');
    const parsed = statePatch(route);
    patch.routeConstraints = { days: parsed.days, pace: parsed.pace };
  }
  if ('categoryPreference' in body) {
    const filter = parseCategoryPreference(body.categoryPreference);
    if (!filter) throw new InputError('景点偏好约束格式无效');
    patch.categoryPreference = filter;
  }
  return patch;
}

export function attractionIds(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 50 || value.some(id => typeof id !== 'string' || !id.trim() || id.length > 100)) throw new InputError('景点列表无效');
  return [...new Set(value as string[])];
}

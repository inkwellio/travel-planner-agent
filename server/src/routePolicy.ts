import type { TripState } from '../../shared/types.js';

/** 未明确指定路线要求时，按勾选数量安排天数；旧参数不再成为隐藏限制。 */
export function routeState(state: TripState, selectedCount: number): TripState {
  const days = state.routeConstraints?.days ?? Math.ceil(selectedCount / 3);
  return {
    ...state,
    days: Math.max(1, Math.min(7, Math.trunc(days) || 1)),
    pace: state.routeConstraints?.pace ?? '适中',
  };
}

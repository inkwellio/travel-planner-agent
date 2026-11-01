/** 每轮景点推荐独立控制数量，不随旧行程的天数或节奏变化。 */
export function recommendationPolicy() {
  return { count: 20, candidateLimit: 60 };
}

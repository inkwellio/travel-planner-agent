import OpenAI from 'openai';
import { consume, isQuotaError } from './limits.js';

const key = process.env.DEEPSEEK_API_KEY;
const client = key ? new OpenAI({ apiKey: key, baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', timeout: 30000, maxRetries: 0 }) : null;
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
export const llmMode = client ? 'deepseek' : 'mock';
export const llmEnabled = () => !!client;

/** 只负责模型调用。无有效结果时返回 null，由业务决定是否可以降级。 */
export async function modelJSON<T>(system: string, user: string): Promise<T | null> {
  if (!client) return null;
  try {
    consume('deepseek');
    const r = await client.chat.completions.create({
      model: MODEL, temperature: 0, response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    });
    return JSON.parse(r.choices[0]?.message?.content ?? 'null') as T;
  } catch (e) {
    if (isQuotaError(e)) throw e;
    console.warn('[deepseek] model unavailable:', (e as Error).message);
    return null;
  }
}

import type { MapProvider } from './MapProvider.js';
import { AmapProvider } from './AmapProvider.js';
import { MockProvider } from './MockProvider.js';

let provider: MapProvider | undefined;
export function getMapProvider(): MapProvider {
  if (!provider) provider = process.env.AMAP_WEB_KEY ? new AmapProvider(process.env.AMAP_WEB_KEY) : new MockProvider();
  return provider;
}
/** 真实调用失败时回退到 mock，保证流程可用 */
export const fallback = new MockProvider();
export type { MapProvider };

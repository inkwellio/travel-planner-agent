import type { Attraction, DayWeather, DrivingOption, TransitOption } from '../../../shared/types.js';

export interface LngLat { lng: number; lat: number }
export interface PoiResult {
  name: string; location: LngLat; address?: string; amapId?: string;
  type?: string; rating?: number; photos?: string[]; openHours?: string; phone?: string;
  province?: string; city?: string; district?: string; adcode?: string;
}

/** 地理编码命中。高德空字段在适配层收成空串，不把 [] 传上来。 */
export interface GeocodeHit {
  level: string;
  province: string;
  city: string;
  district: string;
  township: string;
  formattedAddress?: string;
  adcode?: string;
}

/** 地图适配层：后端唯一的地图出口，换供应商只需新增实现 */
export interface MapProvider {
  readonly name: string;
  searchPoi(keyword: string, city: string, opts?: { types?: string; page?: number }): Promise<PoiResult[]>;
  searchAround(location: LngLat, opts: { types: string; radius: number; keywords?: string; page?: number }): Promise<PoiResult[]>;
  transitRoute(from: LngLat, to: LngLat, city: string, opts?: { destinationCity?: string }): Promise<TransitOption | undefined>;
  drivingRoute(from: LngLat, to: LngLat): Promise<Omit<DrivingOption, 'parking'> | undefined>;
  nearbyParking(at: LngLat): Promise<string | undefined>;
  weather(city: string, days: number): Promise<DayWeather[]>;
  /** 把短语解析成行政区或兴趣点。没有命中或服务失败时返回 null。 */
  geocode(address: string): Promise<GeocodeHit | null>;
  /** 保留全部地理编码候选供语义确认；服务失败抛错，不与空结果混淆。 */
  geocodeCandidates(address: string, city?: string): Promise<GeocodeHit[]>;
}

export function haversineKm(a: LngLat, b: LngLat) {
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export type { Attraction };

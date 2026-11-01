// 前后端共享类型
/**
 * amap: 高德实时；web: 网页检索后由模型从原文提取（附出处）；llm: 无依据时模型生成；
 * manual: 按 POI ID 人工覆盖；sample: 本地示例库（mock 模式）
 */
export type Source = 'amap' | 'web' | 'llm' | 'manual' | 'sample';
export interface Field<T = string> { value: T; source: Source; sourceUrl?: string; sourceTitle?: string; fetchedAt?: string }

export interface Attraction {
  id: string;
  name: string;
  city: string;
  location: { lng: number; lat: number };
  indoor: boolean;
  tags: string[];
  image?: string;
  /** 示例数据标记：仅来自本地示例库时为 true */
  sample: boolean;
  // —— 基础层（高德 POI 实时，source=amap）——
  amapId?: string;
  address?: string;
  district?: string;
  adcode?: string;
  poiType?: string;
  rating?: number;
  photos?: string[];
  phone?: string;
  highlights?: Field;          // 特色
  duration?: Field;            // 建议游玩时长
  bestTime?: Field;            // 最佳游玩时段
  openHours?: Field;           // 开放/营业时间（高德或示例库）
  closedDays?: Field;          // 闭馆日（补充层）
  ticket?: Field;              // 门票和预约
  audience?: Field;            // 适合人群和体力强度
  tips?: Field;                // 实用贴士
  food?: Field;                // 周边美食
}

export type TransitLineMode = 'subway' | 'bus' | 'railway' | 'other';
export interface TransitRoute {
  lines: string[];        // 线路
  lineModes?: TransitLineMode[]; // 与线路一一对应，来自地图交通类型
  transfers: string[];    // 换乘站
  durationMin: number;
  fare?: number;          // 元；未返回票价时不填，不估算为免费
  walkMeters?: number;
  source: Source;
}
export interface TransitOption extends TransitRoute {
  alternatives?: { subway?: TransitRoute; bus?: TransitRoute };
  availability?: { subway: 'available' | 'not_found' | 'unavailable'; bus: 'available' | 'not_found' | 'unavailable' };
}
export interface DrivingOption {
  durationMin: number;
  distanceKm: number;
  tolls: number;
  parking: string;
  source: Source;
}
export interface Leg { fromId: string; toId: string; transit?: TransitOption; transitStatus?: 'not_found' | 'unavailable'; driving?: DrivingOption }

export interface DayWeather { date: string; text: string; tempMin: number; tempMax: number; rainy: boolean; source: Source }

export interface DayPlan {
  day: number;
  /** skeleton: 只完成分配; ready: 已细化 */
  status: 'skeleton' | 'ready';
  attractionIds: string[];
  names: string[];
  stops?: { attractionId: string; arrive: string; stayMin: number }[];
  legs?: Leg[];
  weather?: DayWeather;
  indoorAlternatives?: string[]; // attraction ids
  summary?: string;
}

export interface RouteDraft { version: number; createdAt: string; note: string; days: DayPlan[]; complete: boolean }

/** 模型理解后的语义条件，可表达类别之外的需求，如少爬坡、安静、亲子。 */
export type AttractionCategory = string;
export interface CategoryPreference {
  include: AttractionCategory[];
  exclude: AttractionCategory[];
  mode: 'strict' | 'prefer';
}

export interface TripState {
  destination: string;
  days: number;
  preferences: string[];
  pace: '轻松' | '适中' | '紧凑';
  /** 聊天中明确提出的路线要求；未指定时按所选景点自动安排。days/pace 保留兼容旧行程。 */
  routeConstraints?: { days?: number; pace?: '轻松' | '适中' | '紧凑' };
  companions: '独自' | '情侣' | '朋友' | '带老人' | '带小孩' | '家庭';
  /** 仅在用户明确要求后续沿用类别约束时保存；手动更改偏好会清除。 */
  categoryPreference?: CategoryPreference;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  recommendations?: string[]; // attraction ids
  /** 已接受的本轮约束，供后续追问继承；不会自动改变规划参数。 */
  recommendationContext?: { query: string; criteria: CategoryPreference; searchKeywords: string[] };
  /** 待澄清的地点请求；下一轮补充城市/地址时恢复原问题，而不是重新开始。 */
  locationClarification?: {
    action: 'sightseeing';
    query: string;
    place: { anchor: string | null; locationType: 'region' | 'poi' | 'unknown'; city?: string | null };
    criteria: CategoryPreference;
    searchKeywords: string[];
  };
  /** 写入时刻。旧消息可能没有，管理后台用行程 updatedAt 近似 */
  at?: string;
}

export interface Trip {
  id: string;
  /** 匿名用户 ID（前端 localStorage 生成，请求头 X-User-Id） */
  ownerId: string;
  title: string;
  updatedAt: string;
  state: TripState;
  messages: ChatMessage[];
  versions: RouteDraft[];
  activeVersion: number | null;
}

/** API 返回的行程：附带引用到的景点快照 */
export type TripView = Trip & { catalog: Record<string, Attraction> };

/** 分享快照：绑定分享当时的路线版本，之后修改不影响 */
export interface ShareSnapshot {
  id: string; createdAt: string; title: string; state: TripState;
  draft: RouteDraft; catalog: Record<string, Attraction>;
}

/** 管理后台：一位匿名访客（由行程与 user_sessions 聚合，不是独立用户表） */
export interface AdminUser {
  userId: string;
  ip: string;
  lastSeen: string | null;
  tripCount: number;
  messageCount: number;
  banned: boolean;
}

export interface AdminChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

export interface AdminSessionPlan {
  version: number;
  note: string;
  complete: boolean;
  days: { day: number; names: string[]; summary?: string }[];
}

/** 一个行程会话：只读消息流 + 当前路线摘要 */
export interface AdminSession {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
  destination: string;
  days: number;
  pace: TripState['pace'];
  companions: TripState['companions'];
  preferences: string[];
  messages: AdminChatMessage[];
  plan: AdminSessionPlan | null;
}

export interface AdminThread {
  userId: string;
  ip: string;
  lastSeen: string | null;
  banned: boolean;
  sessions: AdminSession[];
}

export interface AdminBan {
  ip: string;
  reason: string | null;
  createdAt: string;
  createdBy: string | null;
  visitorCount: number;
}

/** SSE 事件 */
export type PlanEvent =
  | { type: 'assign'; version: number; days: DayPlan[] }
  | { type: 'day'; version: number; day: DayPlan }
  | { type: 'done'; version: number; trip: TripView }
  | { type: 'error'; message: string; code?: 'daily' | 'rate' };

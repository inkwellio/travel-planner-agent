/**
 * ⚠️ 示例数据（SAMPLE DATA）：杭州景点资料库，仅用于开发演示。
 * 坐标为近似值，开放时间/门票等为整理的参考信息，未与官方实时核对。
 */
import type { Attraction, Field } from '../../../shared/types.js';

const c = (value: string): Field => ({ value, source: 'sample' });
const l = (value: string): Field => ({ value, source: 'llm' });

export const HANGZHOU: Attraction[] = [
  { id: 'xihu-duanqiao', name: '西湖·断桥残雪', city: '杭州', location: { lng: 120.1520, lat: 30.2593 }, indoor: false, tags: ['自然风光', '经典', '拍照'], sample: true,
    highlights: c('西湖十景之一，白堤起点，冬季雪后景致最佳'), duration: c('1–1.5 小时'), bestTime: c('清晨 7–9 点人少，傍晚看日落'),
    openHours: c('全天开放，无闭馆日'), ticket: c('免费，无需预约'), audience: c('全年龄｜体力：低（平路步行）'),
    tips: c('节假日白堤人流极大，建议早到；可沿白堤步行至孤山'), food: c('知味观（湖滨店）、楼外楼') },
  { id: 'gushan-museum', name: '浙江省博物馆（孤山馆区）', city: '杭州', location: { lng: 120.1460, lat: 30.2547 }, indoor: true, tags: ['人文历史', '室内', '博物馆'], sample: true,
    highlights: c('河姆渡、良渚文物与《富春山居图》（剩山图）'), duration: c('1.5–2 小时'), bestTime: c('上午开馆后'),
    openHours: c('9:00–17:00，周一闭馆（节假日除外）'), ticket: c('免费，需提前在官方公众号预约'), audience: c('全年龄｜体力：低'),
    tips: c('雨天首选室内备选；馆内禁止闪光拍照'), food: l('附近楼外楼可品尝西湖醋鱼') },
  { id: 'sudi', name: '苏堤春晓', city: '杭州', location: { lng: 120.1430, lat: 30.2465 }, indoor: false, tags: ['自然风光', '经典', '骑行'], sample: true,
    highlights: c('纵贯西湖南北的长堤，六桥烟柳'), duration: c('1–2 小时'), bestTime: c('春季清晨'),
    openHours: c('全天开放'), ticket: c('免费'), audience: c('情侣、家庭｜体力：中（全程约 2.8 km）'),
    tips: c('可租共享单车，堤上禁止机动车'), food: l('曲院风荷附近有茶室') },
  { id: 'leifeng', name: '雷峰塔', city: '杭州', location: { lng: 120.1489, lat: 30.2316 }, indoor: false, tags: ['人文历史', '经典', '夜景'], sample: true,
    highlights: c('白娘子传说地标，可登塔俯瞰西湖'), duration: c('1 小时'), bestTime: c('傍晚看“雷峰夕照”'),
    openHours: c('8:00–20:00（季节性调整）'), ticket: c('约 40 元，可现场购票'), audience: c('全年龄｜体力：低（有电梯）'),
    tips: c('与净慈寺相邻，可一起游览'), food: l('南山路一带咖啡馆较多') },
  { id: 'lingyin', name: '灵隐寺·飞来峰', city: '杭州', location: { lng: 120.1010, lat: 30.2420 }, indoor: false, tags: ['人文历史', '寺庙', '自然风光'], sample: true,
    highlights: c('千年古刹与飞来峰石窟造像'), duration: c('2–3 小时'), bestTime: c('上午 8–10 点'),
    openHours: c('7:00–18:00'), ticket: c('飞来峰约 45 元 + 灵隐寺香花券约 30 元'), audience: c('全年龄｜体力：中（台阶较多）'),
    tips: c('节假日需提前预约；带老人建议走平缓路线'), food: c('灵隐素斋、法云弄附近茶餐') },
  { id: 'longjing', name: '龙井村', city: '杭州', location: { lng: 120.1190, lat: 30.2240 }, indoor: false, tags: ['茶文化', '自然风光', '小众'], sample: true,
    highlights: c('西湖龙井核心产区，茶园梯田'), duration: c('1.5–2 小时'), bestTime: c('3–4 月采茶季'),
    openHours: c('全天开放'), ticket: c('免费'), audience: c('情侣、家庭｜体力：中（山路）'),
    tips: c('农家茶楼购茶注意辨别，建议看清价格'), food: c('农家菜：龙井虾仁、笋干老鸭煲') },
  { id: 'tea-museum', name: '中国茶叶博物馆（龙井馆区）', city: '杭州', location: { lng: 120.1270, lat: 30.2350 }, indoor: true, tags: ['茶文化', '室内', '博物馆'], sample: true,
    highlights: c('国家级茶专题博物馆，可体验茶艺'), duration: c('1–1.5 小时'), bestTime: c('下午'),
    openHours: c('9:00–16:30，周一闭馆'), ticket: c('免费'), audience: c('全年龄｜体力：低'),
    tips: c('雨天可替代龙井村行程') },
  { id: 'xixi', name: '西溪国家湿地公园', city: '杭州', location: { lng: 120.0640, lat: 30.2730 }, indoor: false, tags: ['自然风光', '亲子', '游船'], sample: true,
    highlights: c('城市湿地，摇橹船穿行芦苇水道'), duration: c('3–4 小时'), bestTime: c('秋季芦花、上午'),
    openHours: c('7:30–18:30（冬季提前）'), ticket: c('门票约 80 元，游船另计'), audience: c('亲子、老人｜体力：低（可坐船）'),
    tips: c('园区大，建议乘电瓶船；带小孩注意防蚊'), food: l('园内河渚街有小吃') },
  { id: 'hefang', name: '河坊街·南宋御街', city: '杭州', location: { lng: 120.1700, lat: 30.2410 }, indoor: false, tags: ['美食', '人文历史', '夜景'], sample: true,
    highlights: c('仿古商业街，老字号与小吃集中'), duration: c('1.5–2 小时'), bestTime: c('傍晚至夜间'),
    openHours: c('全天，商铺约 9:00–22:00'), ticket: c('免费'), audience: c('全年龄｜体力：低'),
    tips: c('胡庆余堂国药号值得一看'), food: c('定胜糕、葱包桧、片儿川') },
  { id: 'gongchen', name: '京杭大运河·拱宸桥', city: '杭州', location: { lng: 120.1420, lat: 30.3190 }, indoor: false, tags: ['人文历史', '小众', '夜景'], sample: true,
    highlights: c('运河南端标志性古桥，周边桥西历史街区'), duration: c('1.5 小时'), bestTime: c('傍晚，可乘水上巴士'),
    openHours: c('全天开放；周边博物馆周一闭馆'), ticket: c('免费'), audience: c('全年龄｜体力：低'),
    tips: c('中国京杭大运河博物馆在附近，雨天可去'), food: c('桥西直街小吃') },
  { id: 'liuhe', name: '六和塔', city: '杭州', location: { lng: 120.1310, lat: 30.2000 }, indoor: false, tags: ['人文历史', '钱塘江'], sample: true,
    highlights: c('钱塘江畔古塔，可远眺钱江大桥'), duration: c('1 小时'), bestTime: c('下午'),
    openHours: c('6:30–17:30'), ticket: c('约 20 元'), audience: c('成人｜体力：中（登塔需爬楼）'),
    tips: c('带老人可只在塔下游览') },
];

export function getAttraction(id: string) { return HANGZHOU.find(a => a.id === id); }

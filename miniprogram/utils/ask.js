/** 与 shared/askFromParams.ts 保持同一句话。小程序打包根在 miniprogram/，不能直接引用仓库外的 TS。 */

const NEED_DESTINATION = '先填写目的地，再发送诉求';
const NO_PLAN_WITHOUT_CITY = '目的地还是空的，所以这次没有推荐景点，也没有路线。请在上方规划参数里填写城市后再发送。';

function hasDestination(state) {
  return !!(state && String(state.destination || '').trim());
}

function messageFromParams(state) {
  const city = String(state.destination || '').trim();
  const prefs = (state.preferences || []).map(p => String(p).trim()).filter(Boolean);
  const pref = prefs.length ? prefs.join('、') : '不限';
  return '请按规划参数推荐景点。' + city + '，偏好：' + pref + '。';
}

module.exports = { NEED_DESTINATION, NO_PLAN_WITHOUT_CITY, hasDestination, messageFromParams };

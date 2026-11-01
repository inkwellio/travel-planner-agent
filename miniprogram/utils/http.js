/** 把 wx.request 的结果收成与 Web ApiError 相同的字段。纯函数，不碰 wx。 */
function parseBody(data) {
  if (data && typeof data === 'object') {
    const tag = Object.prototype.toString.call(data);
    if (tag !== '[object ArrayBuffer]' && tag !== '[object Uint8Array]') return data;
  }
  if (typeof data === 'string' && data) {
    try { return JSON.parse(data); } catch (e) { return {}; }
  }
  return {};
}

function toErr(status, body, retryHeader) {
  const b = parseBody(body);
  const ra = Number(retryHeader || b.retryAfter);
  return {
    status: status || 0,
    code: b.code || '',
    retryAfter: Number.isFinite(ra) ? ra : 0,
    message: b.error || (status ? '请求失败' : '网络错误'),
  };
}

module.exports = { parseBody, toErr };

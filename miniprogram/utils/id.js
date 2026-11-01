/** 匿名用户 ID：32 位十六进制，满足服务端 /^[A-Za-z0-9_-]{8,64}$/。与 Web localStorage 不互通。 */
function randomId() {
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 32; i++) s += hex[Math.floor(Math.random() * 16)];
  return s;
}

function isUserId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);
}

module.exports = { randomId, isUserId };

/** 解析后端 text/event-stream。分块可能切断 UTF-8，先攒齐再交给 JSON。 */

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

function utf8Slice(bytes, from, to) {
  let out = '';
  let i = from;
  while (i < to) {
    const c = bytes[i];
    if (c < 0x80) { out += String.fromCharCode(c); i += 1; continue; }
    if (c < 0xe0 && i + 1 < to) {
      out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2; continue;
    }
    if (c < 0xf0 && i + 2 < to) {
      out += String.fromCharCode(((c & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      i += 3; continue;
    }
    if (c >= 0xf0 && i + 3 < to) {
      const cp = ((c & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      const u = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 0x3ff));
      i += 4; continue;
    }
    break;
  }
  return out;
}

/** 末尾如果是没写完的码点，留在 rest 里等下一块。 */
function decodeUtf8Partial(bytes) {
  const len = bytes.length;
  let end = len;
  let i = len - 1;
  let cont = 0;
  while (i >= 0 && (bytes[i] & 0xc0) === 0x80) { cont += 1; i -= 1; }
  if (i >= 0 && bytes[i] >= 0x80) {
    let need = 1;
    if (bytes[i] >= 0xf0) need = 4;
    else if (bytes[i] >= 0xe0) need = 3;
    else if (bytes[i] >= 0xc0) need = 2;
    if (cont + 1 < need) end = i;
  } else if (i < 0 && cont > 0) end = 0;
  return { text: utf8Slice(bytes, 0, end), rest: bytes.slice(end) };
}

function createSseParser(onEvent) {
  let text = '';
  let pending = new Uint8Array(0);
  function consume(extra) {
    text += String(extra).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let idx = text.indexOf('\n\n');
    while (idx >= 0) {
      const block = text.slice(0, idx);
      text = text.slice(idx + 2);
      const lines = block.split('\n');
      const data = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].indexOf('data:') === 0) data.push(lines[i].slice(5).replace(/^ /, ''));
      }
      if (data.length) {
        try { onEvent(JSON.parse(data.join('\n'))); } catch (e) { /* 心跳或半包已在上层攒 */ }
      }
      idx = text.indexOf('\n\n');
    }
  }
  return {
    pushString(s) { if (s) consume(s); },
    pushBytes(buf) {
      if (!buf || !buf.length) return;
      const merged = pending.length ? concat(pending, buf) : buf;
      const decoded = decodeUtf8Partial(merged);
      pending = decoded.rest;
      if (decoded.text) consume(decoded.text);
    },
  };
}

module.exports = { createSseParser, decodeUtf8Partial };

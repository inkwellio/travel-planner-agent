import { domToBlob } from 'modern-screenshot';

/** 下载文件名：目的地-N天路线.png */
export function cardFilename(destination: string, dayCount: number, _version: number) {
  const name = destination.replace(/[\\/:*?"<>|\r\n]/g, '').trim().slice(0, 40) || '行程';
  return `${name}-${dayCount}天路线.png`;
}

const FAMILIES = new Set(['Noto Serif SC', 'Noto Sans SC']);
const WEIGHTS = new Set(['400', '500', '600']);

/** 只嵌入简体中文和拉丁子集，避免把整包 unicode-range 都打进 PNG。 */
export function cardFontCss(): string {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const sheet of [...document.styleSheets]) {
    let rules: CSSRuleList;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of [...rules]) {
      if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
      const face = rule as CSSFontFaceRule;
      const family = face.style.getPropertyValue('font-family').replace(/['"]/g, '').trim();
      const weight = face.style.getPropertyValue('font-weight').trim();
      if (!FAMILIES.has(family) || !WEIGHTS.has(weight)) continue;
      const picked = pickWoff2(face.style.getPropertyValue('src'), sheet.href);
      if (!picked) continue;
      const key = `${family}/${weight}/${picked}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:${picked};}`);
    }
  }
  return out.join('\n');
}

function pickWoff2(src: string, base: string | null): string | null {
  const parts = src.split(/,(?=(?:[^()]*\([^()]*\))*[^()]*$)/);
  for (const part of parts) {
    if (!/format\((['"]?)woff2\1\)/i.test(part)) continue;
    const m = part.match(/url\((['"]?)([^'")]+)\1\)/);
    if (!m) continue;
    const file = m[2];
    if (file.includes('latin-ext')) continue;
    if (!file.includes('chinese-simplified') && !/-latin-\d/.test(file)) continue;
    const abs = new URL(file, base || location.href).href;
    return `url("${abs}") format("woff2")`;
  }
  return null;
}

function copyThemeVars(node: HTMLElement) {
  const cs = getComputedStyle(document.documentElement);
  for (let i = 0; i < cs.length; i++) {
    const prop = cs.item(i);
    if (!prop.startsWith('--')) continue;
    node.style.setProperty(prop, cs.getPropertyValue(prop));
  }
}

/** 跨域照片栅格化会失败：能取到就内联，否则留色块底。 */
async function settleImages(node: HTMLElement) {
  const imgs = [...node.querySelectorAll('img')];
  await Promise.all(imgs.map(async img => {
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith('data:')) return;
    img.loading = 'eager';
    try {
      const res = await fetch(src, { mode: 'cors' });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      img.src = data;
    } catch {
      img.remove();
    }
  }));
}

async function shoot(node: HTMLElement, scale: number) {
  const fontCss = cardFontCss();
  return domToBlob(node, {
    scale,
    backgroundColor: '#F5F2EC',
    timeout: 20000,
    font: fontCss ? { cssText: fontCss, preferredFormat: 'woff2' } : { preferredFormat: 'woff2' },
  });
}

/** 把规划结果卡片画成 PNG。先 2x，画布过大时退回 1x。 */
export async function captureResultCard(node: HTMLElement): Promise<Blob> {
  if (node.offsetWidth < 200 || node.offsetHeight < 200) throw new Error('卡片尚未完成布局');
  copyThemeVars(node);
  await document.fonts.ready;
  await settleImages(node);
  try {
    return await shoot(node, 2);
  } catch (err) {
    console.warn('[export-card] 2x 失败，改用 1x', err);
    return await shoot(node, 1);
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2500);
}

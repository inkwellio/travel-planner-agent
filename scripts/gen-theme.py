#!/usr/bin/env python3
"""由每套主题的 7 个基础色推导完整语义色板，生成 web/src/theme.css。改色只需改 THEMES 后重新运行。"""
THEMES = {
  # D 宣纸青瓷（默认，已选定）；E/F 为备选，未在界面暴露
  'd': dict(bg='#F5F2EC', surface='#FFFFFF', primary='#5B7B7A', soft='#E7EDEA', accent='#B08D57', text='#2E3532', muted='#8A8F8B'),
  'e': dict(bg='#F4F1F1', surface='#FFFFFF', primary='#8C6A6E', soft='#EFE6E6', accent='#6F7F8C', text='#3A3335', muted='#9A9192'),
  'f': dict(bg='#F3F4F1', surface='#FFFFFF', primary='#3F4B45', soft='#E6E9E4', accent='#A98B6A', text='#232826', muted='#8B918D'),
}
DEFAULT = 'd'
ERROR = '#A4554F'
h = lambda c: tuple(int(c.lstrip('#')[i:i+2], 16) for i in (0, 2, 4))
def mix(a, b, t):
  A, B = h(a), h(b); return '#%02x%02x%02x' % tuple(round(A[i] + (B[i] - A[i]) * t) for i in range(3))
W = '#FFFFFF'
def palette(c):
  p, a, s, t, m, bg = c['primary'], c['accent'], c['soft'], c['text'], c['muted'], c['bg']
  return {
    'background': bg, 'surface': bg, 'surface-bright': bg, 'surface-dim': mix(s, p, .14),
    'surface-container-lowest': c['surface'], 'surface-container-low': mix(bg, c['surface'], .5),
    'surface-container': s, 'surface-container-high': mix(s, p, .08), 'surface-container-highest': mix(s, p, .14), 'surface-variant': mix(s, p, .14),
    'on-surface': t, 'on-background': t, 'on-surface-variant': mix(t, m, .45), 'outline': m, 'outline-variant': mix(s, m, .35),
    'primary': p, 'surface-tint': p, 'on-primary': W, 'primary-container': mix(p, W, .15), 'on-primary-container': t,
    'primary-fixed': mix(p, W, .86), 'primary-fixed-dim': mix(p, W, .6), 'on-primary-fixed': mix(p, t, .55), 'on-primary-fixed-variant': mix(p, t, .3),
    'inverse-primary': mix(p, W, .6),
    'secondary': a, 'on-secondary': W, 'secondary-container': a, 'on-secondary-container': W,
    'secondary-fixed': mix(a, W, .85), 'secondary-fixed-dim': mix(a, W, .6), 'on-secondary-fixed': mix(a, t, .55), 'on-secondary-fixed-variant': mix(a, t, .3),
    'tertiary': mix(p, t, .2), 'on-tertiary': W, 'tertiary-container': p, 'on-tertiary-container': W,
    'tertiary-fixed': mix(p, W, .86), 'tertiary-fixed-dim': mix(p, W, .6), 'on-tertiary-fixed': mix(p, t, .55), 'on-tertiary-fixed-variant': mix(p, t, .3),
    'error': ERROR, 'on-error': W, 'error-container': mix(ERROR, W, .85), 'on-error-container': mix(ERROR, t, .4),
    'inverse-surface': t, 'inverse-on-surface': bg,
    'day-1': p, 'day-2': a, 'day-3': mix(p, t, .45), 'day-4': m,
  }
rgb = lambda c: ' '.join(map(str, h(c)))
out = ['/* 自动生成：python3 scripts/gen-theme.py —— 勿手改。组件只用语义色（Tailwind 映射到这些变量）。 */']
for name, base in THEMES.items():
  sel = f':root, [data-theme="{name}"]' if name == DEFAULT else f'[data-theme="{name}"]'
  out.append(sel + ' {')
  out += [f'  --c-{k}: {rgb(v)};' for k, v in palette(base).items()]
  out.append('  --c-shadow: 0 0 0;')
  out.append('}')
out.append('''
/* ===== 视觉规范：标题衬线（Noto Serif SC 分片子集）、正文无衬线、卡片 1px soft 描边去阴影、细线分隔 ===== */
:root {
  --font-heading: 'Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', serif;
  --font-body: Inter, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', system-ui, sans-serif;
}
body { font-family: var(--font-body); }
h1, h2, h3, h4 { font-family: var(--font-heading); font-weight: 600; letter-spacing: 0; }
:is(.shadow-sm, .shadow, .shadow-md, .shadow-lg, .shadow-xl, .shadow-inner, [class*="shadow-["]) {
  box-shadow: none !important;
  outline: 1px solid rgb(var(--c-surface-container));
  outline-offset: -1px;
}
header { border-bottom: 1px solid rgb(var(--c-surface-container)); }
aside { border-right: 1px solid rgb(var(--c-surface-container)); }
''')
open('web/src/theme.css', 'w').write('\n'.join(out) + '\n')
print('themes:', ', '.join(THEMES), 'default:', DEFAULT)

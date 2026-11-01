#!/usr/bin/env python3
"""把 Web 端线性图标栅格成小程序 PNG。路径与 web/src/components/Icon.tsx 一致。"""
import json
import re
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1] / 'miniprogram' / 'assets'
ICON_DIR = ROOT / 'icons'
PIN_DIR = ROOT / 'pins'
FONT = '/usr/share/fonts/truetype/macos/Inter-Bold.ttf'

TONES = {
    'ink': '#2E3532',
    'muted': '#8A8F8B',
    'primary': '#5B7B7A',
    'white': '#FFFFFF',
    'accent': '#B08D57',
    'error': '#A4554F',
}

# 只收录小程序用到的名字。d 属性与 web Icon.tsx 相同（描边、无填充）。
ICONS = {
    'add': '<path d="M12 5v14"/><path d="M5 12h14"/>',
    'menu': '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>',
    'close': '<path d="M6 6 18 18"/><path d="M18 6 6 18"/>',
    'search': '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
    'explore': '<circle cx="12" cy="12" r="8"/><path d="m14.6 9.4-1.3 3.9-3.9 1.3 1.3-3.9 3.9-1.3z"/>',
    'arrow_forward': '<path d="M4 12h16"/><path d="m14 6 6 6-6 6"/>',
    'arrow_upward': '<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
    'arrow_downward': '<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
    'expand_more': '<path d="m6 9 6 6 6-6"/>',
    'expand_less': '<path d="m6 15 6-6 6 6"/>',
    'arrow_drop_down': '<path d="m7 10 5 5 5-5"/>',
    'auto_awesome': '<path d="M12 3.5 13.4 8.6 18.5 10 13.4 11.4 12 16.5 10.6 11.4 5.5 10 10.6 8.6 12 3.5z"/><path d="M18 15.2 18.7 17.3 20.8 18 18.7 18.7 18 20.8 17.3 18.7 15.2 18 17.3 17.3 18 15.2z"/>',
    'attach_file': '<path d="M8.2 12.6V7.4a3.8 3.8 0 0 1 7.6 0v8.2a2.5 2.5 0 0 1-5 0V8.2"/>',
    'mic': '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0"/><path d="M12 17v3"/><path d="M9 20h6"/>',
    'landscape': '<path d="m3 18 6-9 3.2 4.2L16 9l5 9H3z"/>',
    'museum': '<path d="M4 20h16"/><path d="M6 20V10M10 20V10M14 20V10M18 20V10"/><path d="M4 10 12 4l8 6"/>',
    'map': '<path d="m9 4-5 2v14l5-2 6 2 5-2V4l-5 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
    'location_on': '<path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z"/><circle cx="12" cy="11" r="1.7"/>',
    'calendar_month': '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3.5V7M16 3.5V7M4 10h16"/>',
    'calendar_view_day': '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9h16M9 5v14M15 5v14"/>',
    'favorite': '<path d="M12 19.4s-6.2-3.8-6.2-8A3.6 3.6 0 0 1 12 8.8a3.6 3.6 0 0 1 6.2 2.6c0 4.2-6.2 8-6.2 8z"/>',
    'directions_walk': '<circle cx="13.5" cy="4.6" r="1.5"/><path d="M9.2 20.5 11.2 14"/><path d="m13.2 20.5.4-6.2"/><path d="M11 14.2 13.2 9.8l3.2 1.4"/><path d="M8.6 11.2 13 9.8l.8 3.2"/>',
    'group': '<circle cx="9" cy="8" r="2.2"/><circle cx="16.2" cy="9" r="1.7"/><path d="M4.2 19c.5-2.6 2.3-4 4.8-4s4.3 1.4 4.8 4"/><path d="M14.2 19c.3-1.8 1.5-3 3.1-3 1.4 0 2.5.9 2.9 2.7"/>',
    'elderly': '<circle cx="9" cy="5" r="1.5"/><path d="M9 8.2 7.8 13 6 19"/><path d="M7.8 13 10.2 13.4 12 19"/><path d="M6.2 11.4h4.2"/>',
    'edit': '<path d="M4 20h4L18.6 9.4a2 2 0 0 0-2.8-2.8L5.2 17.2 4 20z"/><path d="m13.6 6.8 2.8 2.8"/>',
    'star': '<path d="m12 3.8 2 4.7 5.1.5-3.8 3.3 1.1 5L12 15 7.6 17.3l1.1-5L4.9 9l5.1-.5 2-4.7z"/>',
    'schedule': '<circle cx="12" cy="12" r="8"/><path d="M12 8v5l3 2"/>',
    'timer': '<circle cx="12" cy="13.5" r="6.5"/><path d="M12 10.5v3.5l2 1.4"/><path d="M10 3.5h4M12 3.5V6"/>',
    'undo': '<path d="M4.5 12a7.5 7.5 0 1 0 2-5.2"/><path d="M4.5 4.5v5h5"/>',
    'refresh': '<path d="M20 12a8 8 0 0 1-13.6 5.7L4 16"/><path d="M4 12a8 8 0 0 1 13.6-5.7L20 8"/><path d="M20 4v4h-4M4 20v-4h4"/>',
    'ios_share': '<path d="M12 16V4"/><path d="m8 8 4-4 4 4"/><path d="M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12"/>',
    'picture_as_pdf': '<path d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7z"/><path d="M14 3v4h4M8.5 13h7M8.5 16.5h4.5"/>',
    'delete': '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="m7 7 1 13h8l1-13"/>',
    'progress_activity': '<path d="M12 3.2a8.8 8.8 0 1 1-7.4 3.6"/>',
    'thunderstorm': '<path d="M7 15h9.2A3.4 3.4 0 0 0 16.2 8.4 4.6 4.6 0 0 0 7.6 9.5 3 3 0 0 0 7 15z"/><path d="m11.2 15.2-1.6 3.4h2.8l-1.3 3.2 3.6-4.4h-2.6l.8-2.2"/>',
    'confirmation_number': '<path d="M4 8.5A2 2 0 0 0 6 7h12a2 2 0 0 0 2 1.5V11a2 2 0 0 1 0 3.5v1.5a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2V14.5a2 2 0 0 1 0-3.5V8.5z"/><path d="M12 7.5v9"/>',
    'accessible_forward': '<circle cx="15" cy="5" r="1.4"/><path d="M5.5 8.5h6.2l1.6 3"/><path d="m11.5 11.5-2 4.8"/><circle cx="8.2" cy="18.2" r="2"/>',
    'restaurant': '<path d="M6 3.5v7.2A2 2 0 0 0 8 12.7h0a2 2 0 0 0 2-2V3.5"/><path d="M8 3.5v17"/><path d="M6 7.5h4"/><path d="M16.2 3.5c1.6 1.8 2 4 1.4 6-.5 1.5-1.6 2.3-1.6 4V20.5"/>',
    'tips_and_updates': '<path d="M9 18h6M10 21h4"/><path d="M8.2 14.2a4.8 4.8 0 1 1 7.6 0c-.6.7-1.2 1.4-1.4 2.3H9.6c-.2-.9-.8-1.6-1.4-2.3z"/>',
    'directions_bus': '<rect x="5" y="4" width="14" height="12" rx="2"/><path d="M5 11h14"/><circle cx="8.2" cy="14.2" r="0.9"/><circle cx="15.8" cy="14.2" r="0.9"/>',
    'directions_car': '<path d="M5 15.2 6.6 9.6A2 2 0 0 1 8.5 8h7a2 2 0 0 1 1.9 1.6l1.6 5.6"/><path d="M4 15.2h16v2.6a1.2 1.2 0 0 1-1.2 1.2H5.2A1.2 1.2 0 0 1 4 17.8v-2.6z"/><circle cx="7.5" cy="16.6" r="0.9"/><circle cx="16.5" cy="16.6" r="0.9"/>',
    'subway': '<rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12"/><path d="m8.2 21 2.2-3h3.2l2.2 3"/>',
    'phone': '<path d="M8 3.8h2.4l1.2 3.1-1.8 1a10.5 10.5 0 0 0 4.8 4.8l1-1.8 3.1 1.2V14a1.6 1.6 0 0 1-1.6 1.6A13.2 13.2 0 0 1 6.4 5.4 1.6 1.6 0 0 1 8 3.8z"/>',
    'route': '<circle cx="6.5" cy="6.5" r="2"/><circle cx="17.5" cy="17.5" r="2"/><path d="M8.5 6.5h5a4 4 0 0 1 0 8h-5"/>',
    'toll': '<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.2h5M9.5 13.8h5"/>',
    'local_parking': '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 17V7h3.8a3 3 0 0 1 0 6H9"/>',
}


def svg(inner: str, color: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" '
        'fill="none" stroke="%s" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">%s</svg>'
        % (color, inner)
    )


def write_icons() -> None:
    for tone, color in TONES.items():
        folder = ICON_DIR / tone
        folder.mkdir(parents=True, exist_ok=True)
        for name, inner in ICONS.items():
            png = cairosvg.svg2png(bytestring=svg(inner, color).encode('utf-8'), output_width=64, output_height=64)
            path = folder / f'{name}.png'
            path.write_bytes(png)
            with Image.open(path) as im:
                im.convert('RGBA').save(path, optimize=True)
    (ICON_DIR / 'manifest.json').write_text(
        json.dumps({'names': sorted(ICONS), 'tones': sorted(TONES)}, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )


def pin(color: str, num: int, path: Path) -> None:
    s = 64
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(im)
    draw.ellipse((2, 2, s - 3, s - 3), fill=color)
    draw.ellipse((2, 2, s - 3, s - 3), outline=(255, 255, 255, 255), width=4)
    font = ImageFont.truetype(FONT, 28 if num < 10 else 24)
    label = str(num)
    box = draw.textbbox((0, 0), label, font=font)
    x = (s - (box[2] - box[0])) / 2 - box[0]
    y = (s - (box[3] - box[1])) / 2 - box[1]
    draw.text((x, y), label, fill=(255, 255, 255, 255), font=font)
    im.save(path, optimize=True)


def write_brand() -> None:
    """复用网页品牌 SVG，生成小程序可直接使用的本地高清 PNG。"""
    folder = ROOT / 'brand'
    folder.mkdir(parents=True, exist_ok=True)
    source = Path(__file__).resolve().parents[1] / 'web' / 'public' / 'brand' / 'xingcheng-icon.svg'
    cairosvg.svg2png(url=str(source), write_to=str(folder / 'xingcheng-icon.png'), output_width=128, output_height=128)


def write_pins() -> None:
    PIN_DIR.mkdir(parents=True, exist_ok=True)
    for n in range(1, 13):
        pin('#5B7B7A', n, PIN_DIR / f'on-{n}.png')
        pin('#8A8F8B', n, PIN_DIR / f'off-{n}.png')


def prune_unused() -> None:
    """只保留 wxml 里写明的 tone/name，避免主包塞进用不到的配色。"""
    wxml = '\n'.join(p.read_text(encoding='utf-8') for p in (ROOT.parent).rglob('*.wxml'))
    used = set()
    for tag in re.findall(r'<icon\b[^>]*>', wxml):
        name = re.search(r'name="([^"]+)"', tag)
        tone = re.search(r'tone="([^"]+)"', tag)
        if name and tone and '{{' not in name.group(1) and '{{' not in tone.group(1):
            used.add((tone.group(1), name.group(1)))
    for folder in ICON_DIR.iterdir():
        if not folder.is_dir():
            continue
        for png in folder.glob('*.png'):
            if (folder.name, png.stem) not in used:
                png.unlink()
        if not any(folder.glob('*.png')):
            folder.rmdir()


if __name__ == '__main__':
    write_icons()
    write_brand()
    write_pins()
    prune_unused()
    print(f'icons -> {ICON_DIR}')
    print(f'pins  -> {PIN_DIR}')

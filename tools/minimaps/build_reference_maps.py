#!/usr/bin/env python3
"""Builds the two reference-map sets from raw top-down captures:

  gridmap_<mapId>.png   - lettered/numbered grid over the raw capture
  annotated_<mapId>.png - the grid version plus mystery box / Pack-a-Punch /
                          perk machine / wall buy pins

Reads its data straight from public/index.html (BND, BOX_SPOTS,
addWallBuy/addPerkMachine/addPackAPunch calls) rather than hardcoding
coordinates, so a map that gets edited - or a new one added - is picked up
automatically the next time this runs. See ../README.md for the full
pipeline and the coordinate-transform math this depends on.

Usage:
  python3 tools/minimaps/build_reference_maps.py
  (run capture_topdown.mjs first if tools/minimaps/raw/<mapId>.png is missing
  or stale for a map you've changed)
"""
import os
import re
import sys
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(HERE))
INDEX_HTML = os.path.join(REPO_ROOT, 'public', 'index.html')
RAW_DIR = os.path.join(HERE, 'raw')
OUT_DIR = os.path.join(HERE, 'output')

IMG = 1200  # output image size (source captures are 1600, downscaled for repo size)
COLS = ROWS = 6

PERK_KEY = {'revive': 'Q', 'jugg': 'J', 'speed': 'S', 'dtap': 'D', 'stamin': 'U', 'mule': 'M'}
PERK_LEGEND = 'Q=Revive  J=Jugg  S=Speed  D=Double Tap  U=Stamin-Up  M=Mule Kick'

COLORS = {
    'box': (60, 200, 220),
    'pap': (200, 70, 220),
    'perk': (255, 200, 60),
    'wall': (255, 120, 60),
}


def read_source():
    with open(INDEX_HTML, encoding='utf-8') as f:
        return f.read()


def map_registry(src):
    """{mapId: buildFnName}, straight from the MAPS={...} object literal."""
    m = re.search(r'const MAPS=\{(.*?)\n\};', src, re.S)
    if not m:
        raise RuntimeError("Couldn't find `const MAPS={...}` in public/index.html - did it get renamed/restructured?")
    body = m.group(1)
    return dict(re.findall(r"(\w+):\{[^}]*?build:(\w+)\}", body, re.S))


def function_body(src, fn_name):
    """Source text of `function fn_name(){ ... }` up to (not including) the
    next top-level `function ` declaration - same trick used to keep each
    map's build function self-contained in the game source itself."""
    start_m = re.search(r'\nfunction ' + re.escape(fn_name) + r'\(\)\{', src)
    if not start_m:
        raise RuntimeError(f"Couldn't find function {fn_name}() in public/index.html")
    start = start_m.start()
    next_m = re.search(r'\nfunction ', src[start_m.end():])
    end = start_m.end() + next_m.start() if next_m else len(src)
    return src[start:end]


def extract_map_data(body):
    data = {'bnd': None, 'box': [], 'pap': [], 'perk': [], 'wall': []}

    m = re.search(r'BND\s*=\s*(\d+)', body)
    if m:
        data['bnd'] = int(m.group(1))

    m = re.search(r'BOX_SPOTS\s*=\s*(\[.*?\]);', body, re.S)
    if m:
        for coord in re.findall(r'\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)', m.group(1)):
            data['box'].append((float(coord[0]), float(coord[1])))

    for x, z in re.findall(r"addPackAPunch\(\s*([-\d.]+)\s*,\s*([-\d.]+)", body):
        data['pap'].append((float(x), float(z)))

    for key, x, z in re.findall(r"addPerkMachine\('([^']+)',\s*([-\d.]+)\s*,\s*([-\d.]+)", body):
        data['perk'].append((PERK_KEY.get(key, key[:1].upper()), float(x), float(z)))

    # y (2nd numeric arg) isn't used for a top-down map and isn't always a
    # plain literal (e.g. `SY+2.0` on blacksire), so don't require it to
    # look numeric - just skip over whatever's there up to the next comma.
    for def_id, x, z in re.findall(r"addWallBuy\('([^']+)',\s*([-\d.]+)\s*,\s*[^,]+,\s*([-\d.]+)", body):
        label = re.sub(r'\d+$', '', def_id).upper()[:4] or def_id.upper()[:4]
        data['wall'].append((label, float(x), float(z)))

    return data


def get_font(size, bold=True):
    candidates = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    ]
    for p in candidates:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def world_to_px(x, z, bnd, img_size):
    """Matches capture_topdown.mjs's camera exactly: ortho frustum half-extent
    is BND+4, camera.up=(0,0,-1) looking straight down. Under that setup
    world +X maps directly to screen +X and world +Z maps directly to screen
    +Y (down) - see README.md's "Coordinate transform" section for the
    derivation, it's not obvious from the three.js call alone."""
    half = bnd + 4
    px = (x + half) / (2 * half) * img_size
    py = (z + half) / (2 * half) * img_size
    return px, py


def draw_pin(draw, x, y, color, label, font, shape='circle'):
    r = 12
    outline = (0, 0, 0, 255)
    if shape == 'circle':
        draw.ellipse([x - r, y - r, x + r, y + r], fill=color + (235,), outline=outline, width=2)
    elif shape == 'diamond':
        draw.polygon([(x, y - r), (x + r, y), (x, y + r), (x - r, y)], fill=color + (235,), outline=outline, width=2)
    elif shape == 'square':
        draw.rectangle([x - r, y - r, x + r, y + r], fill=color + (235,), outline=outline, width=2)
    tw = draw.textlength(label, font=font)
    draw.text((x - tw / 2, y - 7), label, font=font, fill=(0, 0, 0, 255))


def build_grid(im, title):
    draw = ImageDraw.Draw(im, 'RGBA')
    w, h = im.size
    cell_w, cell_h = w / COLS, h / ROWS
    font_label = get_font(max(12, int(min(cell_w, cell_h) * 0.13)))
    font_title = get_font(22)

    for c in range(1, COLS):
        x = int(c * cell_w)
        draw.line([(x, 0), (x, h)], fill=(255, 255, 255, 110), width=2)
    for r in range(1, ROWS):
        y = int(r * cell_h)
        draw.line([(0, y), (w, y)], fill=(255, 255, 255, 110), width=2)
    draw.rectangle([0, 0, w - 1, h - 1], outline=(255, 255, 255, 160), width=3)

    cols = [chr(ord('A') + i) for i in range(COLS)]
    for c in range(COLS):
        for r in range(ROWS):
            label = f'{cols[c]}{r + 1}'
            x, y = c * cell_w + 5, r * cell_h + 3
            draw.text((x + 1, y + 1), label, font=font_label, fill=(0, 0, 0, 200))
            draw.text((x, y), label, font=font_label, fill=(255, 210, 90, 235))

    tb_h = 32
    draw.rectangle([0, 0, w, tb_h], fill=(10, 10, 14, 200))
    draw.text((10, 6), title, font=font_title, fill=(255, 255, 255, 255))
    return im


def build_annotated(im, data, bnd):
    draw = ImageDraw.Draw(im, 'RGBA')
    w, _h = im.size
    font_pin = get_font(12)
    font_legend = get_font(15)

    for x, z in data['box']:
        draw_pin(draw, *world_to_px(x, z, bnd, w), COLORS['box'], 'BOX', font_pin, 'circle')
    for x, z in data['pap']:
        draw_pin(draw, *world_to_px(x, z, bnd, w), COLORS['pap'], 'PAP', font_pin, 'diamond')
    for letter, x, z in data['perk']:
        draw_pin(draw, *world_to_px(x, z, bnd, w), COLORS['perk'], letter, font_pin, 'circle')
    for label, x, z in data['wall']:
        draw_pin(draw, *world_to_px(x, z, bnd, w), COLORS['wall'], label, font_pin, 'square')

    lw, lh = 230, 118
    lx, ly = 8, im.size[1] - lh - 8
    draw.rectangle([lx, ly, lx + lw, ly + lh], fill=(10, 10, 14, 210), outline=(255, 255, 255, 180), width=2)
    entries = [
        ('circle', COLORS['box'], 'BOX - Mystery box spot'),
        ('diamond', COLORS['pap'], 'PAP - Pack-a-Punch'),
        ('circle', COLORS['perk'], 'letter - Perk machine'),
        ('square', COLORS['wall'], 'code - Wall buy'),
    ]
    yy = ly + 8
    for shape, color, text in entries:
        cx, cy = lx + 16, yy + 8
        if shape == 'circle':
            draw.ellipse([cx - 8, cy - 8, cx + 8, cy + 8], fill=color + (235,), outline=(0, 0, 0, 255), width=2)
        elif shape == 'diamond':
            draw.polygon([(cx, cy - 8), (cx + 8, cy), (cx, cy + 8), (cx - 8, cy)], fill=color + (235,), outline=(0, 0, 0, 255), width=2)
        else:
            draw.rectangle([cx - 8, cy - 8, cx + 8, cy + 8], fill=color + (235,), outline=(0, 0, 0, 255), width=2)
        draw.text((lx + 32, yy), text, font=font_legend, fill=(255, 255, 255, 255))
        yy += 26
    draw.text((lx + 6, yy), PERK_LEGEND, font=get_font(11), fill=(230, 230, 230, 255))
    return im


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    src = read_source()
    registry = map_registry(src)
    if not registry:
        print('No maps found in MAPS registry - nothing to build.', file=sys.stderr)
        sys.exit(1)

    for map_id, fn_name in registry.items():
        raw_path = os.path.join(RAW_DIR, f'{map_id}.png')
        if not os.path.exists(raw_path):
            print(f'skip {map_id}: no raw capture at {raw_path} - run capture_topdown.mjs first', file=sys.stderr)
            continue

        body = function_body(src, fn_name)
        data = extract_map_data(body)
        if data['bnd'] is None:
            print(f'skip {map_id}: no BND=NN found in {fn_name}() - capture/annotation would be misaligned', file=sys.stderr)
            continue

        base = Image.open(raw_path).convert('RGB').resize((IMG, IMG), Image.LANCZOS)

        grid_im = build_grid(base.copy().convert('RGBA'), f'{map_id.upper()}  —  top-down reference')
        grid_im.convert('RGB').save(os.path.join(OUT_DIR, f'gridmap_{map_id}.png'), optimize=True)

        annotated_im = build_annotated(grid_im.copy(), data, data['bnd'])
        annotated_im.convert('RGB').save(os.path.join(OUT_DIR, f'annotated_{map_id}.png'), optimize=True)

        print(f'built {map_id}: BND={data["bnd"]} box={len(data["box"])} pap={len(data["pap"])} '
              f'perk={len(data["perk"])} wall={len(data["wall"])}')


if __name__ == '__main__':
    main()

"""Make the near-white background of disciple sprites transparent, trim them and shrink them for the overlay.
Usage: python3 scripts/cut-white-bg.py brown pink   (outfits to process; files are rewritten in place)
Sprites that are already transparent are left alone, so it is safe to run again."""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'disciples')
SHRINK = 0.4  # the sources are ~1200 px tall; the PIXEL_SCALE of brown and pink in overlay.js is set for this shrink
MARK = (255, 0, 255)


def cut(path):
    src = Image.open(path).convert('RGBA')
    if np.asarray(src)[..., 3].min() < 250:
        return None  # already has a transparent background
    rgb = src.convert('RGB')
    w, h = rgb.size
    # flood from every border pixel that looks like paper, so enclosed whites (cloth, eyes) are kept
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        if min(rgb.getpixel(seed)) > 225 and rgb.getpixel(seed) != MARK:
            ImageDraw.floodfill(rgb, seed, MARK, thresh=28)
    bg = (np.asarray(rgb) == np.array(MARK)).all(axis=2)
    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.MinFilter(23)).filter(ImageFilter.GaussianBlur(1.5))  # drop the pale fringe, soften the edge
    out = src.copy()
    out.putalpha(alpha)
    out = out.crop(alpha.point(lambda v: 255 if v > 20 else 0).getbbox())
    return out.resize((max(1, round(out.width * SHRINK)), max(1, round(out.height * SHRINK))), Image.LANCZOS)


for outfit in sys.argv[1:]:
    for name in sorted(os.listdir(DIR)):
        if not name.endswith(f'-{outfit}.png'):
            continue
        path = os.path.join(DIR, name)
        im = cut(path)
        if im is None:
            print(name, 'already transparent')
            continue
        im.save(path)
        print(name, im.size)

"""Make the green-screen background of disciple sprites transparent, trim them and shrink them for the overlay.
Usage: python3 scripts/cut-green-bg.py pink [brown ...]   (outfits to process; files are rewritten in place)
The background may shade from yellow-green to deep green (generators add a vignette), so it is found by flood fill from the
image border over every green-looking pixel, not by one exact colour. Sprites that are already transparent are skipped."""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

DIR = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'disciples')
SHRINK = 0.4  # the sources are ~1200 px tall; the PIXEL_SCALE of brown and pink in overlay.js is set for this shrink
GREEN_OVER_BLUE = 10  # a background pixel has green above blue by at least this, and green not below red: dark, olive and bright greens


def cut(path):
    src = Image.open(path).convert('RGBA')
    a = np.asarray(src).astype(np.int16)
    if a[..., 3].min() < 250:
        return None  # already has a transparent background
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    greenish = (g - b > GREEN_OVER_BLUE) & (g >= r - 4)
    mask = Image.fromarray((greenish * 255).astype(np.uint8)).copy()  # copy: an image built from an array cannot be edited in place
    h, w = greenish.shape
    border = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    for pt in border:
        if mask.getpixel(pt) == 255:
            ImageDraw.floodfill(mask, pt, 128)  # 128 marks background reached from the border
    bg = np.asarray(mask) == 128
    # drop everything that is not joined to the figure (the generator's star watermark, stray specks)
    fg = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8)).copy()
    seed = next(((x, y) for y in range(int(h * 0.6), h) for x in (w // 2, w // 2 - 30, w // 2 + 30) if fg.getpixel((x, y)) == 255), None)
    if seed:
        ImageDraw.floodfill(fg, seed, 128)
        bg = np.asarray(fg) != 128
    bg = bg | ((g - np.maximum(r, b)) > 30)  # clearly green pixels are background even in pockets the border flood cannot reach (between hands and head)
    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.9))  # drop the green fringe, soften the edge
    # despill: wherever green still leaks into the edge pixels, pull it down to the level of red and blue
    rgb = np.asarray(src.convert('RGB')).astype(np.float32)
    spill = np.clip(rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2]), 0, None)
    rgb[..., 1] -= spill * 0.9
    out = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB').convert('RGBA')
    out.putalpha(alpha)
    out = out.crop(alpha.point(lambda v: 255 if v > 20 else 0).getbbox())
    return out.resize((max(1, round(out.width * SHRINK)), max(1, round(out.height * SHRINK))), Image.LANCZOS)


for outfit in sys.argv[1:]:
    for name in sorted(os.listdir(DIR)):
        if not name.endswith(f'-{outfit}.png'):
            continue
        im = cut(os.path.join(DIR, name))
        if im is None:
            print(name, 'already transparent')
            continue
        im.save(os.path.join(DIR, name))
        print(name, im.size)

"""Chroma-key the green-screen disciple renders into trimmed transparent PNGs.
Usage: python3 scripts/cut-sprites.py   (edit SOURCES below)"""
import os
import numpy as np
from PIL import Image

T = '/var/folders/nf/1j883kxd4b989vktysg1xc_c0000gp/T/orca-paste-'
SOURCES = {
    'bowup-brown': T + '1793432167069-3479eb17-09ba-413c-8935-5faafe0e1963.png',
}
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets', 'disciples')
TARGET_H = 512


def cut(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # "greenness": how much green exceeds the other channels
    green = g - np.maximum(r, b)
    alpha = np.clip(1 - (green - 40) / 90, 0, 1)  # soft edge between 40..130
    # remove the generator's sparkle watermark (bottom-right)
    h, w = alpha.shape
    box = (slice(int(h * 0.84), None), slice(int(w * 0.82), None))
    alpha[box] = np.where(green[box] > 0, 0, alpha[box])  # only greenish pixels, so shoes near the corner stay
    # despill: pull residual green out of the edge pixels
    spill = np.clip(g - np.maximum(r, b), 0, None)
    a[..., 1] = g - spill * 0.85
    out = np.dstack([np.clip(a, 0, 255), alpha * 255]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    img = img.crop(img.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
    s = TARGET_H / img.height
    return img.resize((max(1, round(img.width * s)), TARGET_H), Image.LANCZOS)


def repaint_pale_star(img, box=(488, 458, 516, 500), sample=(466, 468, 486, 488)):
    """The generator's pale star can overlap a shoe edge; repaint those pixels with the shoe colour."""
    px = np.asarray(img).copy()
    x0, y0, x1, y1 = box
    sx0, sy0, sx1, sy1 = sample
    shoe = px[sy0:sy1, sx0:sx1, :3].reshape(-1, 3).mean(axis=0)
    area = px[y0:y1, x0:x1]
    pale = (area[..., :3].min(axis=2) > 120) & (area[..., 3] > 10)
    area[pale, :3] = shoe
    return Image.fromarray(px, 'RGBA')


os.makedirs(OUT, exist_ok=True)
for name, src in SOURCES.items():
    im = cut(src)
    if name == 'bowup-brown':
        im = repaint_pale_star(im)
    im.save(os.path.join(OUT, name + '.png'))
    print(name, im.size)

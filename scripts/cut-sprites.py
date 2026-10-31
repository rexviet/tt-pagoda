"""Chroma-key the green-screen disciple renders into trimmed transparent PNGs.
Usage: python3 scripts/cut-sprites.py   (edit SOURCES below)"""
import os
import numpy as np
from PIL import Image

T = '/var/folders/nf/1j883kxd4b989vktysg1xc_c0000gp/T/orca-paste-'
SOURCES = {
    'walk-brown': T + '1793431989216-1a5eacda-a7c5-4032-8ee7-b746543fb523.png',
    'walkup-brown': T + '1793432020464-dd4ce862-03cf-44ba-b9f7-16e6d382a81c.png',
    'kneelup-brown': T + '1793432049235-ef009948-72b7-4478-9e80-8ba9951321f9.png',
    'raise-brown': T + '1793432082080-c5fdf770-905c-4f94-bcb2-aeed98511f0a.png',
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
    alpha[int(h * 0.84):, int(w * 0.82):] = 0
    # despill: pull residual green out of the edge pixels
    spill = np.clip(g - np.maximum(r, b), 0, None)
    a[..., 1] = g - spill * 0.85
    out = np.dstack([np.clip(a, 0, 255), alpha * 255]).astype(np.uint8)
    img = Image.fromarray(out, 'RGBA')
    img = img.crop(img.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
    s = TARGET_H / img.height
    return img.resize((max(1, round(img.width * s)), TARGET_H), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
for name, src in SOURCES.items():
    im = cut(src)
    im.save(os.path.join(OUT, name + '.png'))
    print(name, im.size)

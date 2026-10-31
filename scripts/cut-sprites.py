"""Chroma-key the green-screen disciple renders into trimmed transparent PNGs.
Usage: python3 scripts/cut-sprites.py   (edit SOURCES below)"""
import os
import numpy as np
from PIL import Image

T = '/var/folders/nf/1j883kxd4b989vktysg1xc_c0000gp/T/orca-paste-'
SOURCES = {
    'kneel-brown': T + '1793431363907-ae9fca84-10e9-4249-aa6f-c30262ec8cda.png',
    'stand-maroon': T + '1793431377732-cdf44fa8-2304-4b81-b88a-b1b035fd5bff.png',
    'bow-grey': T + '1793431385128-44570a07-a981-4936-867e-6dfa7c2a041a.png',
    'walk-pink': T + '1793431389972-0ace903a-f765-4715-bc30-5fe8c4bf20fd.png',
    'kneel-teal': T + '1793431394027-612ae45d-ef3e-483f-9451-92169d50258d.png',
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

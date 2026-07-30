# -*- coding: utf-8 -*-
"""Business-profile artwork, cut from the existing brand masters.

Nothing is invented here: the logo is the logo, the cover is the photograph
already on the site. Apple and Google both require that a place card shows the
actual business, so generated imagery would be the wrong tool even if it looked
good.
"""
import os
from PIL import Image

os.makedirs('brand', exist_ok=True)

# ---------------------------------------------------------------- logo -----
master = Image.open('images/Logo.png').convert('RGB')
W, H = master.size
px = master.load()

# The master sits on an off-white field. Find the ink so the crop can be
# centred on the artwork rather than on the canvas.
bg = px[5, 5]
def is_ink(c, tol=14):
    return abs(c[0]-bg[0]) > tol or abs(c[1]-bg[1]) > tol or abs(c[2]-bg[2]) > tol

step = 4
xs, ys = [], []
for y in range(0, H, step):
    for x in range(0, W, step):
        if is_ink(px[x, y]):
            xs.append(x); ys.append(y)
left, right, top, bottom = min(xs), max(xs), min(ys), max(ys)
print('background %s | artwork bbox x %d-%d  y %d-%d  (%dx%d)'
      % (bg, left, right, top, bottom, right-left, bottom-top))

# Where the tagline starts, so a variant can drop it: the tagline is the last
# band of ink, separated from "1980" by a clear gap.
rows = []
for y in range(top, bottom + 1, 2):
    if any(is_ink(px[x, y]) for x in range(left, right + 1, 4)):
        rows.append(y)
gaps = []
for i in range(1, len(rows)):
    if rows[i] - rows[i-1] > 40:
        gaps.append((rows[i-1], rows[i]))
print('vertical gaps in the lockup:', gaps)

def square(box, size, pad_ratio):
    """Crop a centred square around box, padded, and resize."""
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    half = max(x1 - x0, y1 - y0) / 2 * (1 + pad_ratio)
    half = min(half, cx, cy, W - cx, H - cy)
    crop = master.crop((int(cx - half), int(cy - half), int(cx + half), int(cy + half)))
    return crop.resize((size, size), Image.LANCZOS)

# Full lockup, everything the brand says.
square((left, top, right, bottom), 1024, 0.16).save('brand/apple-logo-full-1024.png')

# Mark plus wordmark, no tagline: at the size a place card actually renders,
# "MODERNE ÄGYPTISCHE KÜCHE" is a grey smear and the pyramid is the thing that
# gets recognised.
if gaps:
    tagline_top = gaps[-1][1]
    square((left, top, right, tagline_top - 10), 1024, 0.16).save('brand/apple-logo-mark-1024.png')
    print('tagline dropped above y =', tagline_top)

# --------------------------------------------------------------- cover -----
hero = Image.open('images/hero.jpg').convert('RGB')
print('hero', hero.size)
hero.save('brand/apple-cover-1920x1280.jpg', quality=92, subsampling=0)

# Apple centre-crops 2.5:1 for Maps and 1.5:1 for Wallet. Render both so the
# composition can be judged before upload rather than after.
def centre_crop(im, ratio, name):
    w, h = im.size
    target_h = int(w / ratio)
    if target_h <= h:
        top_ = (h - target_h) // 2
        out = im.crop((0, top_, w, top_ + target_h))
    else:
        target_w = int(h * ratio)
        left_ = (w - target_w) // 2
        out = im.crop((left_, 0, left_ + target_w, h))
    out.save(name, quality=92)
    print(name, out.size)

centre_crop(hero, 2.5, 'brand/preview-maps-crop-2.5to1.jpg')
centre_crop(hero, 1.5, 'brand/preview-wallet-crop-1.5to1.jpg')

for f in sorted(os.listdir('brand')):
    p = os.path.join('brand', f)
    im = Image.open(p)
    print('%-34s %5dx%-5d %6.0f kB' % (f, im.width, im.height, os.path.getsize(p)/1024))

"""Render a static map of the restaurant from OpenStreetMap tiles.

Self-hosted on purpose: a map that loads from Google (or from any tile server)
on page load transmits the visitor's IP before they have consented, which is
exactly what § 25 TDDDG forbids and what the click-to-load panel exists to
avoid. An image served from our own origin is not a third-party request at all,
so the map can be visible the moment the page opens and Google's embed still
waits for the button.

OpenStreetMap rather than Google because Google's terms restrict storing their
map imagery; OSM is ODbL and needs attribution, which the markup carries.
"""
import io
import math
import urllib.request

LAT, LON = 49.3298953, 8.5472743
ZOOM = 16
WIDTH, HEIGHT = 1280, 640          # 2x the rendered 640x320 box
TILE = 256
OUT = r'C:\Users\User\Projects\kairo1980\images\map-hockenheim'
UA = 'kairo1980.de static map builder (one-off; contact info@kairo1980.de)'


def world_px(lat, lon, z):
    """Slippy-map world pixel coordinates."""
    n = TILE * (2 ** z)
    x = (lon + 180.0) / 360.0 * n
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y


def fetch(z, x, y):
    url = f'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def main():
    from PIL import Image, ImageDraw

    cx, cy = world_px(LAT, LON, ZOOM)
    # The restaurant sits in the upper third, not the middle: the notice card
    # occupies the bottom of the frame, and a map of the town with the pin
    # hidden behind a panel is just a map of the town.
    MARKER_AT = 0.30
    left = cx - WIDTH / 2
    top = cy - HEIGHT * MARKER_AT

    tx0, ty0 = int(left // TILE), int(top // TILE)
    tx1, ty1 = int((left + WIDTH) // TILE), int((top + HEIGHT) // TILE)

    canvas = Image.new('RGB', ((tx1 - tx0 + 1) * TILE, (ty1 - ty0 + 1) * TILE), '#e8e0d0')
    for tx in range(tx0, tx1 + 1):
        for ty in range(ty0, ty1 + 1):
            try:
                tile = Image.open(io.BytesIO(fetch(ZOOM, tx, ty))).convert('RGB')
                canvas.paste(tile, ((tx - tx0) * TILE, (ty - ty0) * TILE))
            except Exception as exc:                     # noqa: BLE001
                print('  tile', tx, ty, 'failed:', exc)

    crop_x, crop_y = int(left - tx0 * TILE), int(top - ty0 * TILE)
    img = canvas.crop((crop_x, crop_y, crop_x + WIDTH, crop_y + HEIGHT))

    # The marker, drawn in the site's own gold so it reads as part of the page
    # rather than as a pasted-in pin.
    d = ImageDraw.Draw(img, 'RGBA')
    mx, my = WIDTH // 2, int(HEIGHT * MARKER_AT)
    d.ellipse((mx - 26, my - 26, mx + 26, my + 26), fill=(184, 145, 74, 60))
    d.ellipse((mx - 15, my - 15, mx + 15, my + 15), fill=(184, 145, 74, 255),
              outline=(255, 253, 249, 255), width=4)
    d.ellipse((mx - 5, my - 5, mx + 5, my + 5), fill=(28, 20, 9, 255))

    img.save(OUT + '.webp', 'WEBP', quality=72, method=6)
    img.save(OUT + '.jpg', 'JPEG', quality=72, optimize=True, progressive=True)
    import os
    for ext in ('.webp', '.jpg'):
        print(f'  {OUT}{ext}  {os.path.getsize(OUT + ext) // 1024} KB')


if __name__ == '__main__':
    main()

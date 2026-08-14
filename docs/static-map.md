# The map on the contact section

A map is visible the moment the page opens, and nothing is transmitted to
anybody until the guest asks for it.

## Why it is a picture and not an embed

Google's Maps embed transmits the visitor's IP address and sets cookies **before
any interaction**. § 25 Abs. 1 TDDDG requires prior consent for anything that is
not strictly necessary, and a map on a restaurant page is not; LG München I
awarded damages in 2022 for transmitting an IP to Google via Fonts alone, and an
embed is the stronger case because it also stores on the device.

So "show the map automatically" cannot mean the embed — not with a cookie banner
either, since even then it may not load until somebody accepts.

What it *can* mean is a **still image served from this origin**. That is not a
third-party request at all: no connection, no IP, nothing stored. The guest sees
the street immediately, and Google's interactive map still waits for the button.

OpenStreetMap rather than Google because Google's terms restrict storing their
map imagery. OSM is ODbL, which requires attribution — `.map-attrib` carries it
and it stays legible. **Do not move it behind a hover or into a `title`
attribute**: attribution nobody can see is not attribution.

## Regenerating it

If the restaurant moves, or the map wants a different zoom:

```
python tools/build-static-map.py
```

It fetches the OSM tiles around `LAT`/`LON`, stitches them, draws the marker in
the site's own gold, and writes `images/map-hockenheim.webp` and `.jpg`.

Two constants are worth knowing about:

- `ZOOM` — 16 shows the streets around the restaurant and the Hockenheimring.
- `MARKER_AT` — 0.30, so the restaurant sits in the **upper third**. The notice
  card occupies the bottom of the frame, and with the marker centred it sat
  behind the card: a map of the town with the pin hidden is just a map of the
  town.

The image is 1280×640 for a 640×320 box — 2× for a retina screen. It is
`loading="lazy"` because the contact section is below the fold.

## What the tests hold

`tests/e2e/seo.spec.js`:

- **no request leaves this origin** before the button is pressed, after
  scrolling the whole page so every lazy image is fetched;
- the map is actually on screen with a real width, not a grey placeholder;
- the attribution names OpenStreetMap;
- the consent panel is transparent and the notice sits on its own card, so a
  regression to a full-width scrim is caught;
- clicking loads the Google embed and removes the picture, the attribution and
  the panel together.

## The privacy policy says this too

Section 5 of `datenschutz.html` states, in all three languages, that the map
shown before consent is a still image from our own server, that no connection to
Google is made, and that the image comes from OpenStreetMap. If this ever stops
being true — a hosted tile service, a Google static image — that paragraph has
to change in the same commit.

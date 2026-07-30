# Business-profile artwork

Not part of the website — these are the files to upload to Apple Business
Connect, the Google Business Profile, Bing Places and Instagram. `.assetsignore`
keeps them out of the deployed site.

Everything here is cut from the existing brand masters. Nothing is generated:
Apple and Google both require that a place card shows the actual business, and
the logo is the logo — it is never redrawn.

| File | Use | Spec it satisfies |
| --- | --- | --- |
| `apple-logo-mark-1024.png` | Apple Business Connect logo | 1024 × 1024 PNG. Tagline removed: at the size a place card renders, "MODERNE ÄGYPTISCHE KÜCHE" is an illegible grey band, and the pyramid is what gets recognised. |
| `logo-full-1024.png` | Google, Instagram, invoices, anywhere the logo is shown large enough to read the tagline | 1024 × 1024 PNG, full lockup |
| `apple-cover-1920x1280.jpg` | Apple Business Connect cover photo | 1920 × 1280, above Apple's 1600 × 1040 minimum and below the 4864 px maximum |
| `preview-maps-crop-2.5to1.jpg` | Preview only — do not upload | What Apple Maps shows: a 2.5:1 centre crop |
| `preview-wallet-crop-1.5to1.jpg` | Preview only — do not upload | What Apple Wallet shows: a 1.5:1 centre crop |

Sources: `images/Logo.png` (6000 × 4000 master) and `images/hero.jpg`.
Regenerate with the script in the commit that added this folder.

## Before uploading the cover

Apple requires a single unedited photograph of the actual location, with no
promotional text, watermark or clip art. `hero.jpg` qualifies **only if it is
our own photograph of our own food**. If it came from a stock library or an
agency, it must not go on the place card — and it should be reviewed for the
website too.

# PWA Icons

The `icon.svg` file is the source icon.

To generate PNG icons needed for the PWA manifest:

## Option A: Online (easiest)
1. Open https://realfavicongenerator.net or https://maskable.app
2. Upload `icon.svg`
3. Download `icon-192.png` and `icon-512.png`
4. Place them in this folder

## Option B: Command line (requires ImageMagick)
```bash
convert -background none icon.svg -resize 192x192 icon-192.png
convert -background none icon.svg -resize 512x512 icon-512.png
```

## Option C: Node.js (sharp)
```bash
npm install sharp
node -e "
const sharp = require('sharp');
sharp('icon.svg').resize(192).png().toFile('icon-192.png');
sharp('icon.svg').resize(512).png().toFile('icon-512.png');
"
```

## Note
The app works without the PNG icons — the SVG in `index.html` handles the
visual. PNG icons are only needed for the "Add to Home Screen" prompt on iOS/Android.
Without them, the browser will use a screenshot thumbnail instead.

# jpg.py <druk_dir> [long_side_px]  -- every lodz_*.svg in druk_dir -> lodz_*.jpg (same drawing as the PDF)
# Rasterised by headless Chrome (env CHROME = path to the binary), saved as JPEG by Pillow.
import sys, os, re, glob, subprocess, tempfile, pathlib
from PIL import Image
Image.MAX_IMAGE_PIXELS = None
DST = sys.argv[1]; LONG = int(sys.argv[2]) if len(sys.argv) > 2 else 2500
CHROME = os.environ.get('CHROME', 'chromium')
tmp = pathlib.Path(tempfile.mkdtemp())
for svg in sorted(glob.glob(f'{DST}/lodz_*.svg')):
    s = open(svg, encoding='utf-8').read(2000)
    w, h = map(float, re.search(r'width="([\d.]+)" height="([\d.]+)"', s).groups())
    k = LONG / max(w, h); png = tmp / 'p.png'
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--user-data-dir={tmp}/profile',
                    f'--window-size={round(w)},{round(h)}', f'--force-device-scale-factor={k:.4f}',
                    f'--screenshot={png}', pathlib.Path(svg).resolve().as_uri()], check=True, capture_output=True, timeout=300)
    im = Image.open(png).convert('RGB'); out = svg[:-4] + '.jpg'
    assert min(im.size) > 1000, f'{svg}: suspicious size {im.size}'
    im.save(out, quality=80, optimize=True, progressive=True)
    print(os.path.basename(out), im.size, os.path.getsize(out) // 1024, 'KB')

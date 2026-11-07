"""Render work/ocr_queue.csv entries to PNG and split them into batches of ~40.
Usage: py -I -X utf8 remonty/pipeline/ocr_prepare.py
Outputs: work/ocr_png/<doc_id>/pNNN.png, work/ocr_batches/batch_NN.csv (doc_id,page,png,out)
OCR text is expected in work/ocr/<doc_id>/pNNN.txt (copied into text/ by e01_build.py).
"""
import csv, shutil
from pathlib import Path
import pypdfium2 as pdfium
from PIL import Image

W = Path(__file__).resolve().parents[1] / "work"
MAXSIDE, BATCH = 2200, 40
Image.MAX_IMAGE_PIXELS = 300_000_000

rows = list(csv.DictReader(open(W / "ocr_queue.csv", encoding="utf-8")))
shutil.rmtree(W / "ocr_batches", ignore_errors=True)
(W / "ocr_batches").mkdir(parents=True)
items = []
for r in rows:
    src, h, pg = Path(r["src"]), r["doc_id"], int(r["page"])
    png = W / "ocr_png" / h / f"p{pg:03d}.png"
    png.parent.mkdir(parents=True, exist_ok=True)
    if not png.exists():
        if src.suffix.lower() == ".pdf":
            try:
                page = pdfium.PdfDocument(str(src))[pg - 1]
            except Exception as e:
                print("RENDER FAIL", h, pg, e); continue
            w, hh = page.get_size()
            im = page.render(scale=min(2.2, MAXSIDE / max(w, hh))).to_pil().convert("RGB")
        else:
            im = Image.open(src)
            im.seek(0)
            im = im.convert("RGB")
            im.thumbnail((MAXSIDE, MAXSIDE))
        im.save(png)
    items.append((h, pg, str(png), str(W / "ocr" / h / f"p{pg:03d}.txt")))
for i in range(0, len(items), BATCH):
    with open(W / "ocr_batches" / f"batch_{i // BATCH + 1:02d}.csv", "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, lineterminator="\n"); w.writerow(["doc_id", "page", "png", "out"]); w.writerows(items[i:i + BATCH])
print(len(items), "items,", (len(items) + BATCH - 1) // BATCH, "batches")

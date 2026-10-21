"""
Membuat aset kartu (welcome / goodbye / levelup) dari template yang berisi teks contoh.
Dijalankan SEKALI oleh developer (bukan oleh bot):  python3 tools/build-card-assets.py <welcome.png> <goodbye.png> <levelup.png>
Hasil di config/cards/: *-bg.png (latar tanpa teks variabel), mask-*.png, bar-*.png, metrics.json
Butuh: opencv-python, numpy, pillow, fonttools
"""
import json, sys
import cv2, numpy as np
from PIL import Image, ImageDraw
from fontTools.ttLib import TTFont

OUT = "config/cards"
welcome, goodbye, levelup = sys.argv[1:4]

def load(p):
    im = cv2.imread(p, cv2.IMREAD_UNCHANGED)
    if im.shape[2] == 4:
        a = im[:, :, 3:4] / 255.0
        im = (im[:, :, :3] * a + 255 * (1 - a)).astype(np.uint8)
    return im

def whiteish(img, box, thr=215, grow=9):
    x1, y1, x2, y2 = box
    roi = img[y1:y2, x1:x2]
    m = (roi.min(axis=2) > thr).astype(np.uint8) * 255
    m = cv2.dilate(m, np.ones((grow, grow), np.uint8))
    full = np.zeros(img.shape[:2], np.uint8)
    full[y1:y2, x1:x2] = m
    return full

def darkish(img, box, thr=120, grow=9):
    x1, y1, x2, y2 = box
    roi = img[y1:y2, x1:x2]
    m = (roi.max(axis=2) < thr).astype(np.uint8) * 255
    m = cv2.dilate(m, np.ones((grow, grow), np.uint8))
    full = np.zeros(img.shape[:2], np.uint8)
    full[y1:y2, x1:x2] = m
    return full

def frost(img, rect, radius=36, sigma=14, dark=0.6):
    """Plat kaca (blur + gelap) berujung bulat — menyembunyikan sisa teks lama dan memberi kontras untuk teks baru."""
    x1, y1, x2, y2 = rect
    blur = cv2.GaussianBlur(img, (0, 0), sigma)
    m = Image.new("L", (img.shape[1], img.shape[0]), 0)
    ImageDraw.Draw(m).rounded_rectangle(rect, radius=radius, fill=255)
    m = cv2.GaussianBlur(np.array(m, np.float32) / 255.0, (0, 0), 1.6)[..., None]
    out = img.astype(np.float32) * (1 - m) + (blur.astype(np.float32) * dark) * m
    # garis tepi tipis agar terlihat seperti kaca
    edge = Image.new("L", (img.shape[1], img.shape[0]), 0)
    ImageDraw.Draw(edge).rounded_rectangle(rect, radius=radius, outline=255, width=2)
    e = cv2.GaussianBlur(np.array(edge, np.float32) / 255.0, (0, 0), 0.8)[..., None] * 0.22
    out = out * (1 - e) + 255 * e
    return np.clip(out, 0, 255).astype(np.uint8)

def inpaint(img, mask, radius=9):
    return cv2.inpaint(img, mask, radius, cv2.INPAINT_TELEA)

# ── welcome ────────────────────────────────────────────────────────────────
w = load(welcome)
m = whiteish(w, (960, 270, 1730, 425), grow=13)          # "@user telah bergabung"
m |= whiteish(w, (1000, 500, 1690, 620), grow=13)        # "@NAMA GROUP"
m |= whiteish(w, (1295, 925, 1840, 1010), grow=13)       # "remaining 100 member"
w = inpaint(w, m, 11)
w = frost(w, (948, 262, 1752, 432), 40, dark=0.8)
w = frost(w, (982, 488, 1722, 632), 40, dark=0.8)
w = frost(w, (1270, 906, 1856, 1024), 40, dark=0.7)
cv2.rectangle(w, (84, 352), (460, 730), (255, 255, 255), -1)   # isi kotak "Foto Profile" → putih polos
cv2.imwrite(f"{OUT}/welcome-bg.png", w)

# ── goodbye ────────────────────────────────────────────────────────────────
g = load(goodbye)
m = whiteish(g, (240, 290, 860, 410), grow=13)           # "@user telah keluar"
m |= whiteish(g, (150, 495, 995, 600), grow=13)          # "FROM @NAMA GROUP"
m |= whiteish(g, (90, 950, 640, 1040), grow=13)          # "remaining 100 member"
g = inpaint(g, m, 11)
g = frost(g, (232, 282, 880, 418), 40, dark=0.8)
g = frost(g, (146, 486, 1004, 620), 40, dark=0.8)
g = frost(g, (62, 932, 654, 1056), 40, dark=0.7)
cv2.rectangle(g, (1016, 286), (1392, 662), (255, 255, 255), -1)
cv2.imwrite(f"{OUT}/goodbye-bg.png", g)

# ── levelup ────────────────────────────────────────────────────────────────
l = load(levelup)
m = whiteish(l, (835, 620, 1510, 705), grow=15)          # "Sekarang level 12"
m |= whiteish(l, (165, 780, 470, 870), grow=15)          # "@user"
l = inpaint(l, m, 11)
l = frost(l, (826, 618, 1516, 706), 36, dark=0.55)      # plat "Sekarang level N"
l = frost(l, (160, 772, 474, 876), 34, dark=0.55)       # plat "@user"

# lingkaran angka: isi polos (angka diisi ulang saat runtime)
for cx, cy in ((688, 542), (1648, 540)):
    cv2.circle(l, (cx, cy), 78, (240, 240, 243), -1, cv2.LINE_AA)

# bar progres: ratakan track memakai warna sisi kanan, per baris (isi digambar ulang saat runtime)
for y in range(520, 558):
    l[y, 808:1526] = l[y, 1440:1520].mean(axis=0)
cv2.imwrite(f"{OUT}/levelup-bg.png", l)

# ── mask & sprite ──────────────────────────────────────────────────────────
S = 512
ci = Image.new("L", (S * 4, S * 4), 0)
ImageDraw.Draw(ci).ellipse((0, 0, S * 4 - 1, S * 4 - 1), fill=255)
ci.resize((S, S), Image.LANCZOS).save(f"{OUT}/mask-circle.png")

# sprite isi progres: tutup kiri / tengah / tutup kanan (tinggi 28)
H = 28
big = Image.new("RGBA", (H * 8, H * 4), (0, 0, 0, 0))
ImageDraw.Draw(big).rounded_rectangle((0, 0, H * 8 - 1, H * 4 - 1), radius=H * 2, fill=(255, 255, 255, 255))
bar = big.resize((H * 2, H), Image.LANCZOS)
bar.crop((0, 0, H // 2, H)).save(f"{OUT}/bar-left.png")
bar.crop((H // 2, 0, H * 2 - H // 2, H)).resize((4, H)).save(f"{OUT}/bar-mid.png")
bar.crop((H * 2 - H // 2, 0, H * 2, H)).save(f"{OUT}/bar-right.png")

# ── metrik font (lebar huruf) agar teks bisa dipas tanpa library canvas ─────
metrics = {}
for name, path in (("bold", "config/fonts/Poppins-Bold.ttf"), ("medium", "config/fonts/Poppins-Medium.ttf")):
    f = TTFont(path)
    upm = f["head"].unitsPerEm
    cmap = f.getBestCmap()
    hmtx = f["hmtx"]
    widths = {chr(c): hmtx[g][0] / upm for c, g in cmap.items() if c < 0x250}
    metrics[name] = widths
json.dump(metrics, open(f"{OUT}/metrics.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("selesai")

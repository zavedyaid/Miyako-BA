"""
Mengubah gambar maskot menjadi ASCII art untuk banner konsol → lib/banner-art.js
Dua gaya: BRAILLE (detail tinggi; font terminal modern semua mendukung) dan ASCII murni (cadangan untuk terminal
tanpa Unicode, mis. konsol Linux mentah). Tiga ukuran: LARGE (60 kolom), SMALL (34 kolom — konsol panel / HP) dan TINY (24 kolom — sangat sempit).
Pakai:  python3 tools/make-banner-art.py <gambar.png>        Butuh: pillow, numpy
"""
import json, sys
import numpy as np
from PIL import Image, ImageChops, ImageFilter

def load(path):
    im = Image.open(path)
    if im.mode in ("RGBA", "LA", "P"):
        im = Image.alpha_composite(Image.new("RGBA", im.size, (255, 255, 255, 255)), im.convert("RGBA"))   # latar transparan → putih
    im = im.convert("RGB")
    box = ImageChops.difference(im, Image.new("RGB", im.size, (255, 255, 255))).convert("L").point(lambda v: 255 if v > 12 else 0).getbbox()
    return im.crop(box) if box else im

BAYER = np.array([[0, 4], [6, 2], [1, 5], [7, 3]], dtype=np.float32) / 8.0 + 1 / 16

def dots(im, cols, thick=3, gain=2.0):
    """Matriks titik (True = nyala). Garis pastel ditebalkan (MinFilter) lalu di-dither terurut."""
    w = cols * 2
    h = round(w * im.height / im.width)
    h += (-h) % 4
    g = im.convert("L").filter(ImageFilter.MinFilter(thick)).resize((w, h), Image.BOX)
    dark = np.clip((255 - np.array(g, dtype=np.float32)) / 255.0 * gain, 0, 1)
    return dark > np.tile(BAYER, (h // 4 + 1, w // 2 + 1))[:h, :w]

def to_braille(d):
    rows = []
    for cy in range(0, d.shape[0], 4):
        line = ""
        for cx in range(0, d.shape[1], 2):
            bits = 0
            for dx, dy, bit in ((0, 0, 0), (0, 1, 1), (0, 2, 2), (1, 0, 3), (1, 1, 4), (1, 2, 5), (0, 3, 6), (1, 3, 7)):
                if d[cy + dy, cx + dx]:
                    bits |= 1 << bit
            line += chr(0x2800 + bits) if bits else " "
        rows.append(line.rstrip())
    return trim(rows)

ASCII_RAMP = " .:-=+*#%@"
def to_ascii(d):
    rows = []
    for cy in range(0, d.shape[0], 4):
        line = ""
        for cx in range(0, d.shape[1], 2):
            n = int(d[cy:cy + 4, cx:cx + 2].sum())          # 0..8 titik → kepadatan karakter
            line += ASCII_RAMP[min(len(ASCII_RAMP) - 1, round(n / 8 * (len(ASCII_RAMP) - 1)))]
        rows.append(line.rstrip())
    return trim(rows)

def trim(rows):
    while rows and not rows[0].strip(): rows.pop(0)
    while rows and not rows[-1].strip(): rows.pop()
    return rows

im = load(sys.argv[1])
large, small, tiny = dots(im, 60, 3, 2.0), dots(im, 34, 3, 2.8), dots(im, 24, 3, 3.4)
art = {"BRAILLE_LARGE": to_braille(large), "BRAILLE_SMALL": to_braille(small), "BRAILLE_TINY": to_braille(tiny), "ASCII_LARGE": to_ascii(large), "ASCII_SMALL": to_ascii(small), "ASCII_TINY": to_ascii(tiny)}
with open("lib/banner-art.js", "w") as f:
    f.write("// Dibuat oleh tools/make-banner-art.py dari gambar maskot — jangan diedit manual.\n")
    for k, v in art.items():
        f.write(f"export const {k} = " + json.dumps(v, ensure_ascii=False, indent=2) + ";\n\n")
print("\n".join(art["ASCII_LARGE"])); print("---"); print("\n".join(art["ASCII_SMALL"]))

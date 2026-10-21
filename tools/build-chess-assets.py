"""
Membuat sprite bidak catur (config/chess/<w|b><p|n|b|r|q|k>.png, 96x96 RGBA) dari glyph font DejaVu Sans.
Dijalankan SEKALI oleh developer (bukan oleh bot):   python3 tools/build-chess-assets.py [path/ke/DejaVuSans.ttf]
Butuh: pillow + font berisi glyph catur (DejaVu Sans). Hasil PNG ikut di repo, jadi bot tidak butuh font ini.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont

FONT = sys.argv[1] if len(sys.argv) > 1 else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
OUT = "config/chess"
S, K = 96, 4  # ukuran akhir, faktor supersampling
GLYPH = {"k": "\u265a", "q": "\u265b", "r": "\u265c", "b": "\u265d", "n": "\u265e", "p": "\u265f"}
STYLE = {"w": dict(fill=(250, 250, 252, 255), stroke=(28, 32, 48, 255), width=7), "b": dict(fill=(34, 38, 52, 255), stroke=(236, 240, 250, 255), width=5)}

os.makedirs(OUT, exist_ok=True)
font = ImageFont.truetype(FONT, 78 * K)
for color, st in STYLE.items():
    for piece, ch in GLYPH.items():
        big = Image.new("RGBA", (S * K, S * K), (0, 0, 0, 0))
        d = ImageDraw.Draw(big)
        l, t, r, b = d.textbbox((0, 0), ch, font=font, stroke_width=st["width"])
        x, y = (S * K - (r - l)) // 2 - l, (S * K - (b - t)) // 2 - t + 2 * K
        d.text((x, y), ch, font=font, fill=st["fill"], stroke_width=st["width"], stroke_fill=st["stroke"])
        big.resize((S, S), Image.LANCZOS).save(f"{OUT}/{color}{piece}.png")
print("OK", OUT, len(os.listdir(OUT)), "sprites")

"""Buat config/games/chess-ai.jpg & abyss.jpg (1280×720). Jalankan: python3 tools/make-game-banners.py"""
import math, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont
W, H = 1280, 720
B = "config/fonts/Poppins-Bold.ttf"; M = "config/fonts/Poppins-Medium.ttf"
SYM = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def grad(top, bot):
    im = Image.new("RGB", (W, H)); d = ImageDraw.Draw(im)
    for y in range(H):
        t = y / H; d.line((0, y, W, y), fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return im

def label(d, title, l2, tag, tagfill):
    f = ImageFont.truetype(B, 84); s = ImageFont.truetype(M, 32); t = ImageFont.truetype(B, 30)
    for dx in (5,): d.text((70 + dx, 80 + dx), title, font=f, fill=(0, 0, 0, 170))
    d.text((70, 80), title, font=f, fill=(255, 255, 255))
    d.text((72, 190), l2, font=s, fill=(225, 218, 255))
    d.rounded_rectangle((70, 270, 470, 328), radius=29, fill=tagfill)
    d.text((270, 299), tag, font=t, fill=(255, 255, 255), anchor="mm")
    d.rounded_rectangle((70, 342, 470, 400), radius=29, fill=(255, 205, 70))
    d.text((270, 371), "HADIAH  •  .redeem", font=t, fill=(80, 46, 4), anchor="mm")

# ── catur vs AI ──
im = grad((20, 24, 56), (48, 30, 90)); d = ImageDraw.Draw(im, "RGBA")
sq = 66; ox, oy = 690, 96
for r in range(8):
    for c in range(8):
        x, y = ox + c * sq, oy + r * sq
        d.rectangle((x, y, x + sq, y + sq), fill=(226, 232, 246, 235) if (r + c) % 2 == 0 else (92, 124, 176, 235))
d.rectangle((ox - 6, oy - 6, ox + 8 * sq + 6, oy + 8 * sq + 6), outline=(255, 255, 255, 90), width=4)
pf = ImageFont.truetype(SYM, 54)
for (c, r, g, col) in [(1, 6, "♞", (255, 255, 255)), (3, 7, "♛", (255, 255, 255)), (4, 0, "♚", (26, 22, 48)), (6, 1, "♜", (26, 22, 48)), (2, 3, "♝", (255, 255, 255)), (5, 4, "♟", (26, 22, 48))]:
    cx, cy = ox + c * sq + sq // 2, oy + r * sq + sq // 2
    d.text((cx + 2, cy + 3), g, font=pf, fill=(0, 0, 0, 120), anchor="mm"); d.text((cx, cy), g, font=pf, fill=col, anchor="mm")
d.rounded_rectangle((70, 440, 520, 560), radius=24, fill=(255, 255, 255, 28))
d.text((100, 470), "Level 1 - 8", font=ImageFont.truetype(B, 34), fill=(255, 214, 102))
d.text((100, 515), "Atur kesulitan AI", font=ImageFont.truetype(M, 28), fill=(225, 218, 255))
label(d, "CATUR VS AI", "Lawan AI, hadiah di setiap level", "MAIN  •  .chessai", (59, 130, 246))
im.save("config/games/chess-ai.jpg", quality=90)

# ── abyss ──
im = grad((26, 10, 40), (88, 20, 40)); d = ImageDraw.Draw(im, "RGBA")
random.seed(3)
for _ in range(60):
    x, y = random.randint(0, W), random.randint(0, 360); d.ellipse((x, y, x + 3, y + 3), fill=(255, 220, 200, random.randint(60, 200)))
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0)); g = ImageDraw.Draw(glow); g.ellipse((780, 40, 1180, 440), fill=(255, 90, 60, 150)); glow = glow.filter(ImageFilter.GaussianBlur(60)); im.paste(glow, (0, 0), glow)
d = ImageDraw.Draw(im, "RGBA")
for i in range(9):  # menara bertingkat
    w = 420 - i * 34; x0 = 980 - w // 2; y0 = 140 + i * 56
    d.rectangle((x0, y0, x0 + w, y0 + 54), fill=(30 + i * 3, 14, 32 + i * 2, 255), outline=(10, 4, 16, 255), width=3)
    for k in range(3 + (8 - i) // 2):
        wx = x0 + 30 + k * (w - 60) // max(1, (2 + (8 - i) // 2)); d.rectangle((wx, y0 + 14, wx + 12, y0 + 34), fill=(255, 190, 90, 220))
d.polygon([(980, 60), (930, 142), (1030, 142)], fill=(160, 40, 60, 255))
d.rectangle((0, 650, W, H), fill=(14, 6, 20, 255))
d.text((1010, 560), "⚔", font=ImageFont.truetype(SYM, 120), fill=(255, 255, 255, 230), anchor="mm")
label(d, "MIYAKO ABYSS", "Turun 10 lantai - boss - relik", "MAIN  •  .abyss", (122, 92, 255))
im.save("config/games/abyss.jpg", quality=90)
print("ok")

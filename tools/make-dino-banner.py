"""Buat config/games/dino.jpg — thumbnail kartu .dino (1280×720). Jalankan: python3 tools/make-dino-banner.py"""
import math, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1280, 720
random.seed(7)
FONT_B = "config/fonts/Poppins-Bold.ttf"
FONT_M = "config/fonts/Poppins-Medium.ttf"

def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

img = Image.new("RGB", (W, H))
px = img.load()
top, mid, bot = (23, 18, 60), (118, 56, 150), (255, 150, 96)
for y in range(H):
    t = y / (H * 0.78)
    c = lerp(top, mid, t / 0.6) if t < 0.6 else lerp(mid, bot, min(1, (t - 0.6) / 0.4))
    for x in range(W): px[x, y] = c

d = ImageDraw.Draw(img, "RGBA")
for _ in range(90):  # bintang
    x, y, r = random.randint(0, W), random.randint(0, 330), random.choice([1, 1, 2])
    d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 255, 255, random.randint(90, 220)))

# matahari + halo
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0)); g = ImageDraw.Draw(glow)
g.ellipse((820, 150, 1140, 470), fill=(255, 190, 110, 150)); glow = glow.filter(ImageFilter.GaussianBlur(40))
img.paste(glow, (0, 0), glow); d = ImageDraw.Draw(img, "RGBA")
d.ellipse((880, 210, 1080, 410), fill=(255, 226, 150, 255))

def mountains(base, amp, color, step, phase):
    pts = [(0, H)]
    for i in range(-1, W // step + 2):
        pts += [(i * step, base), (i * step + step // 2, base - amp * (0.55 + 0.35 * math.sin(i * 1.7 + phase))), ((i + 1) * step, base)]
    pts.append((W, H)); d.polygon(pts, fill=color)
mountains(520, 170, (70, 40, 110, 255), 260, 0.4)
mountains(560, 120, (44, 28, 84, 255), 190, 2.2)

# tanah
d.rectangle((0, 560, W, H), fill=(26, 20, 46, 255))
d.rectangle((0, 556, W, 566), fill=(52, 40, 86, 255))
for x in range(0, W, 64): d.rectangle((x, 640, x + 34, 645), fill=(255, 255, 255, 70))

def block(x, y, w, h, fill, line=(23, 20, 45, 255), lw=4):
    d.rectangle((x, y, x + w, y + h), fill=fill, outline=line, width=lw)

def dino(x, y, s):  # x,y = kiri-atas badan; s = skala
    P = lambda v: int(v * s)
    for lx in (5, 20): block(x + P(lx), y + P(30), P(6), P(9), (224, 231, 248, 255), lw=3)
    d.rectangle((x + P(3), y + P(37), x + P(13), y + P(40)), fill=(112, 92, 255, 255))
    d.rectangle((x + P(18), y + P(37), x + P(28), y + P(40)), fill=(112, 92, 255, 255))
    block(x, y, P(27), P(30), (245, 247, 255, 255))
    block(x + P(22), y + P(5), P(13), P(18), (245, 247, 255, 255))
    for sx in (4, 12):
        d.polygon([(x + P(sx), y), (x + P(sx + 5), y - P(9)), (x + P(sx + 10), y)], fill=(110, 92, 255, 255), outline=(23, 20, 45, 255))
    d.rectangle((x + P(2), y + P(7), x + P(9), y + P(11)), fill=(112, 92, 255, 255))
    d.rectangle((x + P(12), y + P(14), x + P(21), y + P(18)), fill=(112, 92, 255, 255))
    d.rectangle((x + P(32), y + P(11), x + P(36), y + P(15)), fill=(23, 20, 45, 255))
    d.polygon([(x + P(34), y + P(17)), (x + P(42), y + P(19)), (x + P(34), y + P(21))], fill=(255, 189, 67, 255))

def cactus(x, y, w, h):
    f = (226, 111, 120, 255)
    block(x, y, w, h, f, (53, 29, 53, 255), 4)
    block(x - 26, y + 34, 26, 22, f, (53, 29, 53, 255), 4); block(x - 26, y + 14, 20, 46, f, (53, 29, 53, 255), 4)
    block(x + w, y + 60, 26, 22, f, (53, 29, 53, 255), 4); block(x + w + 4, y + 40, 22, 42, f, (53, 29, 53, 255), 4)

# bayangan + dino besar melompat
d.ellipse((520, 600, 760, 632), fill=(0, 0, 0, 90))
dino(540, 338, 5.4)
cactus(900, 440, 44, 116); cactus(1010, 478, 36, 78)
# burung
d.ellipse((1000, 470, 1080, 512), fill=(255, 225, 90, 255), outline=(33, 23, 55, 255), width=4)
d.ellipse((1058, 458, 1096, 494), fill=(255, 225, 90, 255), outline=(33, 23, 55, 255), width=4)
d.polygon([(1015, 485), (980, 440), (1032, 476)], fill=(255, 77, 183, 255), outline=(33, 23, 55, 255))
d.polygon([(1095, 476), (1124, 486), (1095, 494)], fill=(255, 112, 72, 255))

# koin hadiah melayang
for cx, cy in ((620, 240), (690, 205), (760, 240)):
    d.ellipse((cx - 24, cy - 24, cx + 24, cy + 24), fill=(255, 205, 70, 255), outline=(176, 120, 20, 255), width=4)
    d.text((cx, cy), "G", font=ImageFont.truetype(FONT_B, 26), fill=(150, 90, 10, 255), anchor="mm")

# teks
title = ImageFont.truetype(FONT_B, 92); sub = ImageFont.truetype(FONT_M, 34); tag = ImageFont.truetype(FONT_B, 30)
def shadow_text(xy, text, font, fill, sh=5):
    d.text((xy[0] + sh, xy[1] + sh), text, font=font, fill=(10, 6, 30, 200)); d.text(xy, text, font=font, fill=fill)
shadow_text((70, 70), "HYROX DINO", title, (255, 255, 255, 255))
shadow_text((70, 168), "RUNNER", title, (255, 214, 102, 255))
shadow_text((74, 286), "Lompat • Hindari • Raih hadiah", sub, (226, 214, 255, 255), 3)
d.rounded_rectangle((70, 340, 420, 396), radius=28, fill=(112, 92, 255, 235))
d.text((245, 368), "MAIN  •  .dino", font=tag, fill=(255, 255, 255, 255), anchor="mm")
d.rounded_rectangle((70, 410, 420, 466), radius=28, fill=(255, 205, 70, 235))
d.text((245, 438), "HADIAH  •  .redeem", font=tag, fill=(80, 46, 4, 255), anchor="mm")

img = img.filter(ImageFilter.SMOOTH)
img.save("config/games/dino.jpg", quality=90)
print("ok", img.size)

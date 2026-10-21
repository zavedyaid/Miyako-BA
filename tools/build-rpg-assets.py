"""
Aset kartu RPG & profil: ikon item (config/cards/rpg/*.png) dan latar profile / hero / grid / result (config/cards/*-bg.png).
Dijalankan SEKALI oleh developer:  python3 tools/build-rpg-assets.py [gambar.jpg]
Butuh: pillow
"""
import importlib.util, math, sys
from PIL import Image, ImageDraw, ImageFilter
from card_labels import tr, out_path

spec = importlib.util.spec_from_file_location("kit", "tools/build-card-bgs.py")
K = importlib.util.module_from_spec(spec); spec.loader.exec_module(K)
W, H = 1920, 1080

# ── ikon ───────────────────────────────────────────────────────────────────
def canvas(): return Image.new("RGBA", (256, 256), (0, 0, 0, 0))
def save(im, name): im.resize((96, 96), Image.LANCZOS).save(f"config/cards/rpg/{name}.png")
STEEL, WHITE = (214, 226, 244, 255), (255, 255, 255, 255)

def sword():
    im = canvas(); d = ImageDraw.Draw(im)
    d.polygon([(128, 6), (146, 32), (146, 150), (110, 150), (110, 32)], fill=STEEL, outline=WHITE)
    d.rectangle((126, 20, 130, 148), fill=(160, 180, 210, 255))
    d.rounded_rectangle((80, 150, 176, 170), 8, fill=(255, 200, 90, 255))
    d.rectangle((120, 170, 136, 214), fill=(150, 90, 60, 255)); d.ellipse((116, 212, 140, 236), fill=(255, 200, 90, 255))
    return im.rotate(-45, resample=Image.BICUBIC)
def shield():
    im = canvas(); d = ImageDraw.Draw(im)
    d.polygon([(52, 36), (204, 36), (204, 128), (128, 228), (52, 128)], fill=(96, 156, 245, 255), outline=WHITE)
    d.polygon([(72, 56), (184, 56), (184, 124), (128, 196), (72, 124)], fill=(60, 110, 205, 255))
    d.rectangle((120, 60, 136, 190), fill=(255, 215, 110, 255)); d.rectangle((76, 104, 180, 120), fill=(255, 215, 110, 255))
    return im
def potion():
    im = canvas(); d = ImageDraw.Draw(im)
    d.rectangle((104, 44, 152, 100), fill=(220, 235, 255, 230)); d.ellipse((58, 84, 198, 224), fill=(255, 92, 120, 255), outline=WHITE, width=5)
    d.ellipse((84, 120, 116, 152), fill=(255, 190, 205, 255)); d.rounded_rectangle((100, 24, 156, 50), 6, fill=(170, 110, 70, 255))
    return im
def ore():
    im = canvas(); d = ImageDraw.Draw(im)
    d.polygon([(36, 178), (66, 84), (130, 46), (202, 90), (222, 178), (150, 222)], fill=(150, 160, 184, 255), outline=WHITE)
    d.polygon([(66, 84), (130, 46), (120, 120), (80, 150)], fill=(196, 206, 228, 255)); d.polygon([(150, 222), (222, 178), (170, 130)], fill=(110, 118, 142, 255))
    return im
def gem():
    im = canvas(); d = ImageDraw.Draw(im)
    d.polygon([(128, 24), (212, 92), (128, 234), (44, 92)], fill=(92, 228, 255, 255), outline=WHITE)
    d.polygon([(128, 24), (170, 92), (128, 234), (86, 92)], fill=(150, 244, 255, 255))
    d.line((44, 92, 212, 92), fill=WHITE, width=4); d.line((86, 92, 128, 24, 170, 92), fill=WHITE, width=3)
    return im
def fish():
    im = canvas(); d = ImageDraw.Draw(im)
    d.ellipse((34, 92, 190, 172), fill=(255, 168, 92, 255), outline=WHITE, width=4)
    d.polygon([(184, 132), (236, 90), (236, 174)], fill=(255, 130, 70, 255)); d.ellipse((60, 116, 78, 134), fill=(30, 30, 50, 255))
    d.arc((92, 100, 150, 164), 250, 110, fill=(255, 220, 170, 255), width=5)
    return im
def leaf():
    im = canvas(); d = ImageDraw.Draw(im)
    d.polygon([(40, 218), (52, 112), (126, 40), (218, 38), (216, 130), (142, 204)], fill=(100, 216, 130, 255), outline=WHITE)
    d.line((44, 214, 196, 60), fill=(40, 130, 80, 255), width=7)
    return im
def bag():
    im = canvas(); d = ImageDraw.Draw(im)
    d.rounded_rectangle((50, 96, 206, 226), 34, fill=(214, 164, 104, 255), outline=WHITE, width=4)
    d.polygon([(96, 100), (160, 100), (180, 44), (76, 44)], fill=(190, 140, 86, 255)); d.rectangle((84, 92, 172, 108), fill=(255, 215, 110, 255))
    d.ellipse((112, 142, 144, 174), fill=(255, 215, 110, 255))
    return im
def coin():
    im = canvas(); d = ImageDraw.Draw(im)
    d.ellipse((30, 30, 226, 226), fill=(255, 200, 70, 255), outline=WHITE, width=5); d.ellipse((60, 60, 196, 196), outline=(200, 140, 20, 255), width=8)
    d.rectangle((120, 84, 136, 172), fill=(200, 140, 20, 255))
    return im
def star():
    im = canvas(); d = ImageDraw.Draw(im); pts = []
    for i in range(10):
        r = 108 if i % 2 == 0 else 46; a = -math.pi / 2 + i * math.pi / 5
        pts.append((128 + r * math.cos(a), 132 + r * math.sin(a)))
    d.polygon(pts, fill=(255, 214, 90, 255), outline=WHITE)
    return im
def fang():
    im = canvas(); d = ImageDraw.Draw(im)
    d.polygon([(86, 28), (176, 28), (152, 120), (128, 228), (104, 120)], fill=(244, 238, 220, 255), outline=WHITE)
    d.polygon([(128, 28), (176, 28), (152, 120), (128, 228)], fill=(214, 206, 184, 255))
    return im
def crate():
    im = canvas(); d = ImageDraw.Draw(im)
    d.rounded_rectangle((34, 110, 222, 220), 10, fill=(176, 118, 70, 255), outline=WHITE, width=4)
    d.rounded_rectangle((34, 62, 222, 124), 24, fill=(206, 146, 90, 255), outline=WHITE, width=4)
    d.rectangle((34, 118, 222, 132), fill=(255, 215, 110, 255)); d.rounded_rectangle((112, 112, 144, 156), 8, fill=(255, 215, 110, 255))
    return im
def heart():
    im = canvas(); d = ImageDraw.Draw(im)
    d.ellipse((34, 50, 138, 154), fill=(255, 92, 120, 255)); d.ellipse((118, 50, 222, 154), fill=(255, 92, 120, 255))
    d.polygon([(40, 120), (216, 120), (128, 226)], fill=(255, 92, 120, 255))
    return im
for n, f in dict(sword=sword, shield=shield, potion=potion, ore=ore, gem=gem, fish=fish, leaf=leaf, bag=bag, coin=coin, star=star, fang=fang, crate=crate, heart=heart).items(): save(f(), n)

# ── latar ──────────────────────────────────────────────────────────────────
font, track = K.font, K.track
MED, BOLD = K.MED, K.BOLD
import random

def base(P, accent, glass=(10, 18, 48), flip=False, tint=(20, 40, 90), amt=0.0, shift_art=True):
    c = K.art(flip, tint, amt)
    pm = Image.new("L", (W, H), 0); ImageDraw.Draw(pm).rounded_rectangle(P, radius=56, fill=255)
    g = Image.blend(c.filter(ImageFilter.GaussianBlur(26)), Image.new("RGB", (W, H), glass), .56)
    c = Image.composite(g, c, pm)
    L = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    d.rounded_rectangle(P, radius=56, outline=(190, 220, 255, 90), width=2)
    d.rounded_rectangle((P[0]+8, P[1]+8, P[2]-8, P[3]-8), radius=48, outline=(255, 255, 255, 22), width=1)
    for i in range(72): d.line((P[0]+34, 126+i, P[0]+40, 126+i), fill=accent + (max(255-i*2, 60),))
    return c, L, d

def finish(c, L, out):
    Image.alpha_composite(c.convert("RGBA"), L).convert("RGB").save(out, optimize=True); print("OK", out)

def barcode(d, x0, x1, seed):
    rnd = random.Random(seed); x = x0
    while x < x1:
        w = rnd.choice([2, 2, 3, 4, 6]); d.rectangle((x, 944, x+w-1, 984), fill=(215, 232, 255, 210)); x += w + rnd.choice([3, 4, 5])

def ring(L, d, ac, AX, AY, AS):
    g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse((AX-14, AY-14, AX+AS+14, AY+AS+14), outline=ac + (200,), width=10)
    L = Image.alpha_composite(L, g.filter(ImageFilter.GaussianBlur(10))); d = ImageDraw.Draw(L)
    d.ellipse((AX-12, AY-12, AX+AS+12, AY+AS+12), outline=ac + (255,), width=5)
    d.ellipse((AX-4, AY-4, AX+AS+4, AY+AS+4), outline=(255, 255, 255, 120), width=2)
    d.rounded_rectangle((AX, 618, AX+AS, 674), radius=28, fill=(255, 255, 255, 26), outline=(190, 220, 255, 120), width=2)
    return L, d

LAB, LABC = font(MED, 21), (140, 178, 232, 255)
def field(d, x, y, label, x2):
    track(d, (x, y), label, LAB, LABC, 3); d.line((x, y+96, x2, y+96), fill=(170, 205, 255, 70), width=2)
def divider(d, x0, x1, y):
    for x in range(x0, x1+1):
        t = (x-x0)/(x1-x0); a = int(150*(1-abs(t-.5)*1.5)); d.point((x, y), fill=(170, 210, 255, max(a, 20))); d.point((x, y+1), fill=(170, 210, 255, max(a//2, 10)))
def trk(d, x, y, w, h): d.rounded_rectangle((x, y, x+w, y+h), radius=h//2, fill=(255, 255, 255, 38), outline=(190, 220, 255, 100), width=2)
def badge(d, x, y, w, ac): d.rounded_rectangle((x, y, x+w, y+60), radius=30, fill=ac + (56,), outline=ac + (210,), width=2)

CY = (110, 215, 255)
# profile
c, L, d = base((70, 80, 1200, 1000), CY)
track(d, (132, 118), "PLAYER PROFILE", font(BOLD, 54), (255, 255, 255, 255), 4)
track(d, (134, 184), tr("MIYAKO - BA   ·   KARTU PEMAIN"), font(MED, 23), (150, 195, 255, 255), 3)
badge(d, 950, 124, 200, CY); track(d, (982, 139), tr("PROFIL"), font(BOLD, 24), CY + (255,), 2); divider(d, 130, 1140, 236)
L, d = ring(L, d, CY, 130, 280, 300)
field(d, 490, 268, tr("NAMA"), 1140); field(d, 490, 398, tr("UMUR"), 700); field(d, 730, 398, "GENDER", 1140); field(d, 490, 528, tr("NO. WHATSAPP"), 1140)
track(d, (130, 708), "LEVEL", LAB, LABC, 3); trk(d, 130, 772, 1010, 26)
field(d, 130, 828, "LIMIT", 560); field(d, 620, 828, "GOLD", 1140); barcode(d, 905, 1138, 5); finish(c, L, out_path("config/cards/profile-bg.png"))

# hero
c, L, d = base((70, 80, 1200, 1000), (255, 205, 90), glass=(24, 18, 40), tint=(120, 80, 10), amt=.12)
track(d, (132, 118), "HERO STATUS", font(BOLD, 54), (255, 255, 255, 255), 4)
track(d, (134, 184), tr("MIYAKO - BA   ·   KARTU PETUALANG"), font(MED, 23), (255, 225, 160, 255), 3)
badge(d, 950, 124, 200, (255, 205, 90)); track(d, (984, 139), "RPG", font(BOLD, 24), (255, 205, 90, 255), 2); divider(d, 130, 1140, 236)
L, d = ring(L, d, (255, 205, 90), 130, 280, 300)
field(d, 490, 268, tr("NAMA"), 1140); field(d, 490, 388, "LEVEL", 640); field(d, 670, 388, tr("GELAR"), 1140)
for y, lab in [(508, "HP"), (598, "STAMINA"), (688, "XP")]: track(d, (490, y), lab, LAB, LABC, 3); trk(d, 490, y+38, 650, 22)
field(d, 490, 770, "WEAPON", 800); field(d, 830, 770, "ARMOR", 1140)
field(d, 130, 708, "ATK", 270); field(d, 290, 708, "DEF", 430); field(d, 130, 828, "GOLD", 270); field(d, 290, 828, "DIAMOND", 430)
barcode(d, 905, 1138, 6); finish(c, L, out_path("config/cards/hero-bg.png"))

# grid (inventory / shop)
c, L, d = base((70, 80, 1520, 1000), CY)
badge(d, 1250, 124, 220, CY); divider(d, 130, 1460, 220)
for i in range(4): d.rounded_rectangle((130+i*330, 236, 430+i*330, 298), 28, fill=(255, 255, 255, 26), outline=(190, 220, 255, 110), width=2)
for i in range(12):
    sx, sy = 110+(i % 3)*450, 330+(i//3)*150
    d.rounded_rectangle((sx, sy, sx+410, sy+130), 24, fill=(255, 255, 255, 20), outline=(190, 220, 255, 80), width=2)
barcode(d, 1225, 1458, 7); finish(c, L, out_path("config/cards/grid-bg.png"))

# result
c, L, d = base((70, 80, 1200, 1000), CY)
divider(d, 130, 1140, 236); d.rounded_rectangle((930, 124, 1150, 184), radius=30, fill=(255, 255, 255, 26), outline=(190, 220, 255, 150), width=2)
L, d = ring(L, d, CY, 130, 280, 300)
track(d, (490, 262), tr("HASIL"), LAB, LABC, 3); d.line((490, 292, 1140, 292), fill=(170, 205, 255, 70), width=2)
for y, lab in [(708, "HP"), (808, "XP")]: track(d, (130, y), lab, LAB, LABC, 3); trk(d, 130, y+36, 300, 22)
barcode(d, 905, 1138, 8); finish(c, L, out_path("config/cards/result-bg.png"))

# atm (kartu bank): panel lebar, kartu kredit di kiri, saldo di kanan
c, L, d = base((70, 80, 1850, 1000), (255, 205, 90), glass=(14, 20, 44))
track(d, (132, 118), "MIYAKO ATM", font(BOLD, 54), (255, 255, 255, 255), 4)
track(d, (134, 184), tr("BANK MIYAKO   ·   SIMPAN  ·   TARIK  ·   TRANSFER"), font(MED, 23), (255, 225, 160, 255), 3)
badge(d, 1580, 124, 220, (255, 205, 90)); track(d, (1620, 139), "SECURE", font(BOLD, 24), (255, 205, 90, 255), 2); divider(d, 130, 1790, 236)
CX, CYY, CW, CH = 130, 290, 900, 510
grad = Image.new("RGBA", (CW, CH))
gd = ImageDraw.Draw(grad)
for x in range(CW + CH):
    t = x / (CW + CH); col = (int(54 + 110 * t), int(110 - 30 * t), int(236 - 20 * t), 255)
    gd.line((x, 0, x - CH, CH), fill=col, width=2)
shine = Image.new("RGBA", (CW, CH), (0, 0, 0, 0)); ImageDraw.Draw(shine).ellipse((380, -260, 1100, 330), fill=(255, 255, 255, 46))
grad = Image.alpha_composite(grad, shine)
cm = Image.new("L", (CW, CH), 0); ImageDraw.Draw(cm).rounded_rectangle((0, 0, CW - 1, CH - 1), radius=44, fill=255)
cl = Image.new("RGBA", (W, H), (0, 0, 0, 0)); cl.paste(grad, (CX, CYY), cm)
c = Image.alpha_composite(c.convert("RGBA"), cl).convert("RGB")
d = ImageDraw.Draw(L)
d.rounded_rectangle((CX, CYY, CX + CW, CYY + CH), radius=44, outline=(255, 255, 255, 120), width=3)
track(d, (CX + 60, CYY + 46), "MIYAKO BANK", font(BOLD, 34), (255, 255, 255, 255), 5)
d.rounded_rectangle((CX + 60, CYY + 130, CX + 170, CYY + 210), radius=14, fill=(255, 214, 120, 255), outline=(190, 140, 40, 255), width=3)
for yy in (150, 170, 190): d.line((CX + 60, CYY + yy, CX + 170, CYY + yy), fill=(190, 140, 40, 255), width=2)
d.line((CX + 115, CYY + 130, CX + 115, CYY + 210), fill=(190, 140, 40, 255), width=2)
for i, r_ in enumerate((18, 32, 46)): d.arc((CX + 200 - r_, CYY + 170 - r_, CX + 200 + r_, CYY + 170 + r_), -50, 50, fill=(255, 255, 255, 210), width=4)
d.ellipse((CX + CW - 190, CYY + CH - 120, CX + CW - 90, CYY + CH - 20), fill=(255, 120, 150, 210)); d.ellipse((CX + CW - 140, CYY + CH - 120, CX + CW - 40, CYY + CH - 20), fill=(255, 205, 90, 210))
track(d, (CX + 60, CYY + 350), "CARD HOLDER", font(MED, 20), (225, 235, 255, 255), 3)
track(d, (CX + 590, CYY + 350), "MEMBER SINCE", font(MED, 20), (225, 235, 255, 255), 3)
for (x, y, lab) in [(1130, 268, tr("SALDO BANK")), (1130, 398, tr("DOMPET")), (1130, 528, tr("TOTAL ASET")), (1130, 658, tr("BUNGA HARIAN")), (1130, 788, tr("LIMIT BANK"))]:
    field(d, x, y, lab, 1790)
trk(d, 1130, 900, 660, 22)
barcode(d, 1555, 1788, 9)
finish(c, L, out_path("config/cards/atm-bg.png"))

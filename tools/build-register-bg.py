"""
Membuat latar kartu REGISTER (config/cards/register-bg.png, 1920x1080) dari gambar karakter.
Dijalankan SEKALI oleh developer (bukan oleh bot):
    python3 tools/build-register-bg.py [config/cards/register-source.jpg]
Isi yang dibuat di sini hanya bagian TETAP (panel kaca, judul, label, garis, bingkai foto).
Nilai yang berubah (nama, umur, SN, dst.) digambar bot saat runtime lewat lib/cards.js → LAYOUT.register.
Butuh: pillow
"""
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

W, H = 1920, 1080
SRC = sys.argv[1] if len(sys.argv) > 1 else "config/cards/register-source.jpg"
OUT = "config/cards/register-bg.png"
BOLD = "config/fonts/Poppins-Bold.ttf"
MED = "config/fonts/Poppins-Medium.ttf"

# ── latar: gambar karakter digeser ke kanan supaya wajahnya tidak tertutup panel ──────────
src = Image.open(SRC).convert("RGB")
k = H / src.height
big = src.resize((round(src.width * k), H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.9))
SHIFT = 520
canvas = Image.new("RGB", (W, H))
left = big.crop((0, 0, SHIFT, H)).transpose(Image.FLIP_LEFT_RIGHT)
canvas.paste(left, (0, 0))
canvas.paste(big.crop((0, 0, W - SHIFT, H)), (SHIFT, 0))
blur = canvas.filter(ImageFilter.GaussianBlur(16))
fade = Image.linear_gradient("L").rotate(90, expand=True).resize((SHIFT + 160, H))  # putih(kiri)→hitam(kanan)
mask = Image.new("L", (W, H), 0)
mask.paste(fade.transpose(Image.FLIP_LEFT_RIGHT), (0, 0))
canvas = Image.composite(blur, canvas, mask)

# vinyet halus agar tepi tidak menyilaukan
vig = Image.radial_gradient("L").resize((W, H))
vig = ImageChops.invert(vig).point(lambda v: int(v * 0.55))
canvas = Image.composite(Image.new("RGB", (W, H), (6, 10, 28)), canvas, vig)

# ── panel kaca ─────────────────────────────────────────────────────────────────────────
PANEL = (70, 80, 1200, 1000)
R = 56
pm = Image.new("L", (W, H), 0)
ImageDraw.Draw(pm).rounded_rectangle(PANEL, radius=R, fill=255)
glass = canvas.filter(ImageFilter.GaussianBlur(26))
tint = Image.new("RGB", (W, H), (10, 18, 48))
glass = Image.blend(glass, tint, 0.56)
canvas = Image.composite(glass, canvas, pm)

layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(layer)
d.rounded_rectangle(PANEL, radius=R, outline=(190, 220, 255, 90), width=2)
d.rounded_rectangle((PANEL[0] + 8, PANEL[1] + 8, PANEL[2] - 8, PANEL[3] - 8), radius=R - 8, outline=(255, 255, 255, 22), width=1)

def font(path, size): return ImageFont.truetype(path, size)

def track(draw, xy, text, fnt, fill, spacing=3):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + spacing
    return x

# aksen + judul
for i in range(72):
    a = 255 - i * 2
    d.line((104, 126 + i, 110, 126 + i), fill=(110, 215, 255, max(a, 60)), width=1)
track(d, (132, 118), "REGISTRATION CARD", font(BOLD, 54), (255, 255, 255, 255), 4)
track(d, (134, 184), "MIYAKO - BA   ·   OFFICIAL MEMBER", font(MED, 23), (150, 195, 255, 255), 3)

# lencana VERIFIED
d.rounded_rectangle((930, 124, 1150, 184), radius=30, fill=(40, 200, 165, 56), outline=(110, 240, 210, 200), width=2)
cx, cy = 968, 154
d.ellipse((cx - 14, cy - 14, cx + 14, cy + 14), fill=(110, 240, 210, 255))
d.line((cx - 7, cy + 1, cx - 2, cy + 7, cx + 8, cy - 6), fill=(8, 40, 60, 255), width=4, joint="curve")
track(d, (992, 139), "VERIFIED", font(BOLD, 24), (150, 245, 222, 255), 2)

# pembatas
for x in range(130, 1141):
    t = (x - 130) / 1010
    a = int(150 * (1 - abs(t - 0.5) * 1.5))
    d.point((x, 236), fill=(170, 210, 255, max(a, 20)))
    d.point((x, 237), fill=(170, 210, 255, max(a // 2, 10)))

# bingkai foto profil (lingkaran 300px di x=130,y=280) + kilau
AX, AY, AS = 130, 280, 300
glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse((AX - 14, AY - 14, AX + AS + 14, AY + AS + 14), outline=(120, 215, 255, 200), width=10)
glow = glow.filter(ImageFilter.GaussianBlur(10))
layer = Image.alpha_composite(layer, glow)
d = ImageDraw.Draw(layer)
d.ellipse((AX - 12, AY - 12, AX + AS + 12, AY + AS + 12), outline=(150, 225, 255, 255), width=5)
d.ellipse((AX - 4, AY - 4, AX + AS + 4, AY + AS + 4), outline=(255, 255, 255, 120), width=2)

# pil status di bawah foto
d.rounded_rectangle((AX, 618, AX + AS, 674), radius=28, fill=(255, 255, 255, 26), outline=(190, 220, 255, 120), width=2)

# label + garis bawah kolom
LAB = font(MED, 21)
LABC = (140, 178, 232, 255)
def field(x, y, label, x2):
    track(d, (x, y), label, LAB, LABC, 3)
    d.line((x, y + 96, x2, y + 96), fill=(170, 205, 255, 70), width=2)

field(490, 268, "NAMA", 1140)
field(490, 398, "UMUR", 700)
field(730, 398, "GENDER", 1140)
field(490, 528, "NO. WHATSAPP", 1140)
field(130, 708, "SERIAL NUMBER", 560)
field(620, 708, "NO. KARTU", 1140)
field(130, 828, "TERDAFTAR", 560)
field(620, 828, "LEVEL", 1140)

# kaki kartu: teks kecil + barcode hias
track(d, (132, 954), "Kartu diterbitkan otomatis oleh Miyako - BA  ·  zavedya.id", font(MED, 19), (150, 185, 235, 200), 1)
import random
rnd = random.Random(20260418)
x = 905
while x < 1138:
    w = rnd.choice([2, 2, 3, 4, 6])
    d.rectangle((x, 944, x + w - 1, 984), fill=(215, 232, 255, 210))
    x += w + rnd.choice([3, 4, 5])

canvas = Image.alpha_composite(canvas.convert("RGBA"), layer).convert("RGB")
canvas.save(OUT, optimize=True)
print("OK", OUT, canvas.size)

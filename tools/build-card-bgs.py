"""
Membuat latar kartu welcome / goodbye / levelup (config/cards/*-bg.png) bergaya sama dengan kartu register.
Dijalankan SEKALI oleh developer:  python3 tools/build-card-bgs.py [gambar.jpg]
Gambar bawaan: config/cards/register-source.jpg (bisa diganti gambar lain, mis. satu gambar per kartu).
Hanya bagian TETAP yang dibuat di sini; nama, grup, level, dst. digambar bot lewat lib/cards.js → LAYOUT.
Butuh: pillow
"""
import sys, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

W, H = 1920, 1080
SRC = sys.argv[1] if len(sys.argv) > 1 else "config/cards/register-source.jpg"
BOLD, MED = "config/fonts/Poppins-Bold.ttf", "config/fonts/Poppins-Medium.ttf"
font = lambda p, s: ImageFont.truetype(p, s)

def track(d, xy, text, fnt, fill, sp=3):
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=fnt, fill=fill)
        x += d.textlength(ch, font=fnt) + sp

def art(flip, tint, amount):
    src = Image.open(SRC).convert("RGB")
    big = src.resize((round(src.width * H / src.height), H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(0.9))
    S = 520
    c = Image.new("RGB", (W, H))
    c.paste(big.crop((0, 0, S, H)).transpose(Image.FLIP_LEFT_RIGHT), (0, 0))
    c.paste(big.crop((0, 0, W - S, H)), (S, 0))
    blur = c.filter(ImageFilter.GaussianBlur(16))
    m = Image.new("L", (W, H), 0)
    m.paste(Image.linear_gradient("L").rotate(90, expand=True).resize((S + 160, H)).transpose(Image.FLIP_LEFT_RIGHT), (0, 0))
    c = Image.composite(blur, c, m)
    vig = ImageChops.invert(Image.radial_gradient("L").resize((W, H))).point(lambda v: int(v * .55))
    c = Image.composite(Image.new("RGB", (W, H), (6, 10, 28)), c, vig)
    c = Image.blend(c, Image.new("RGB", (W, H), tint), amount)
    return c.transpose(Image.FLIP_LEFT_RIGHT) if flip else c

def build(out, spec):
    dx = 650 if spec["flip"] else 0          # panel di kanan bila dibalik
    ac = spec["accent"]
    c = art(spec["flip"], spec["tint"], spec["tint_amt"])
    P = (70 + dx, 80, 1200 + dx, 1000)
    pm = Image.new("L", (W, H), 0); ImageDraw.Draw(pm).rounded_rectangle(P, radius=56, fill=255)
    glass = Image.blend(c.filter(ImageFilter.GaussianBlur(26)), Image.new("RGB", (W, H), spec["glass"]), .56)
    c = Image.composite(glass, c, pm)
    L = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L)
    d.rounded_rectangle(P, radius=56, outline=(190, 220, 255, 90), width=2)
    d.rounded_rectangle((P[0]+8, P[1]+8, P[2]-8, P[3]-8), radius=48, outline=(255, 255, 255, 22), width=1)
    for i in range(72): d.line((104+dx, 126+i, 110+dx, 126+i), fill=ac + (max(255-i*2, 60),))
    track(d, (132+dx, 118), spec["title"], font(BOLD, 54), (255, 255, 255, 255), 4)
    track(d, (134+dx, 184), spec["subtitle"], font(MED, 23), spec["sub"] + (255,), 3)
    # lencana kanan atas
    bx = 930 + dx; bw = spec["badge_w"]
    d.rounded_rectangle((bx + 220 - bw, 124, bx + 220, 184), radius=30, fill=ac + (56,), outline=ac + (210,), width=2)
    track(d, (bx + 220 - bw + 30, 139), spec["badge"], font(BOLD, 24), ac + (255,), 2)
    for x in range(130, 1141):
        t = (x - 130) / 1010; a = int(150 * (1 - abs(t - .5) * 1.5))
        d.point((x + dx, 236), fill=(170, 210, 255, max(a, 20))); d.point((x + dx, 237), fill=(170, 210, 255, max(a // 2, 10)))
    # bingkai foto
    AX, AY, AS = 130 + dx, 280, 300
    g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(g).ellipse((AX-14, AY-14, AX+AS+14, AY+AS+14), outline=ac + (200,), width=10)
    L = Image.alpha_composite(L, g.filter(ImageFilter.GaussianBlur(10))); d = ImageDraw.Draw(L)
    d.ellipse((AX-12, AY-12, AX+AS+12, AY+AS+12), outline=ac + (255,), width=5)
    d.ellipse((AX-4, AY-4, AX+AS+4, AY+AS+4), outline=(255, 255, 255, 120), width=2)
    d.rounded_rectangle((AX, 618, AX+AS, 674), radius=28, fill=(255, 255, 255, 26), outline=(190, 220, 255, 120), width=2)
    # kolom
    for (x, y, label, x2) in spec["fields"]:
        track(d, (x+dx, y), label, font(MED, 21), (140, 178, 232, 255), 3)
        d.line((x+dx, y+96, x2+dx, y+96), fill=(170, 205, 255, 70), width=2)
    # kotak pesan bawah
    by = spec["box_y"]
    d.rounded_rectangle((130+dx, by, 1140+dx, 900), radius=30, fill=(255, 255, 255, 20), outline=(190, 220, 255, 70), width=2)
    for i, line in enumerate(spec["message"]):
        track(d, (170+dx, by + 30 + i*44), line, font(MED, 30), (225, 238, 255, 235), 1)
    if spec.get("track"):  # jalur bar progres
        x, y, w, h = spec["track"]
        d.rounded_rectangle((x+dx, y, x+dx+w, y+h), radius=h//2, fill=(255, 255, 255, 40), outline=(190, 220, 255, 110), width=2)
    track(d, (132+dx, 954), "Kartu diterbitkan otomatis oleh Miyako - BA  ·  zavedya.id", font(MED, 19), (150, 185, 235, 200), 1)
    rnd = random.Random(spec["seed"]); x = 905 + dx
    while x < 1138 + dx:
        w = rnd.choice([2, 2, 3, 4, 6]); d.rectangle((x, 944, x+w-1, 984), fill=(215, 232, 255, 210)); x += w + rnd.choice([3, 4, 5])
    Image.alpha_composite(c.convert("RGBA"), L).convert("RGB").save(out, optimize=True); print("OK", out)

F = lambda *a: a
build("config/cards/welcome-bg.png", dict(
    flip=False, tint=(20, 40, 90), tint_amt=0.0, glass=(10, 18, 48), accent=(110, 215, 255), sub=(150, 195, 255),
    title="WELCOME", subtitle="SELAMAT BERGABUNG  ·  MEMBER BARU", badge="NEW MEMBER", badge_w=250, seed=11,
    fields=[F(490, 268, "NAMA", 1140), F(490, 398, "GRUP", 1140), F(490, 528, "TOTAL MEMBER", 700), F(730, 528, "BERGABUNG", 1140)],
    box_y=708, message=["Semoga betah dan nyaman di sini ya!", "Jangan lupa baca deskripsi & aturan grup."]))
build("config/cards/goodbye-bg.png", dict(
    flip=True, tint=(90, 30, 50), tint_amt=0.22, glass=(40, 14, 34), accent=(255, 150, 160), sub=(255, 190, 200),
    title="GOODBYE", subtitle="SAMPAI JUMPA  ·  TERIMA KASIH SUDAH BERGABUNG", badge="LEFT", badge_w=170, seed=22,
    fields=[F(490, 268, "NAMA", 1140), F(490, 398, "DARI GRUP", 1140), F(490, 528, "SISA MEMBER", 700), F(730, 528, "KELUAR", 1140)],
    box_y=708, message=["Terima kasih sudah pernah bersama kami.", "Sampai bertemu lagi di lain waktu!"]))
build("config/cards/levelup-bg.png", dict(
    flip=False, tint=(120, 80, 10), tint_amt=0.16, glass=(24, 18, 40), accent=(255, 205, 90), sub=(255, 225, 160),
    title="LEVEL UP!", subtitle="SELAMAT  ·  KAMU NAIK LEVEL", badge="NEW LEVEL", badge_w=250, seed=33,
    fields=[F(490, 268, "NAMA", 1140), F(490, 398, "SEBELUM", 700), F(730, 398, "SEKARANG", 1140), F(490, 528, "PROGRESS", 1140)],
    track=(490, 600, 650, 28), box_y=708, message=["Mantap! Terus aktif untuk naik ke level berikutnya.", "Makin tinggi level, makin banyak keseruannya."]))

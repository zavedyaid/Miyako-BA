"""
Label kartu per bahasa. Dipakai build-register-bg.py, build-card-bgs.py, build-rpg-assets.py.

    python3 tools/build-register-bg.py                 → config/cards/register-bg.png     (Indonesia, bawaan lama)
    CARD_LANG=en python3 tools/build-register-bg.py    → config/cards/register-bg.en.png  (English)

Bot memilih berkas "<nama>.<kode>.png" sesuai bahasa pesan; kalau tidak ada, dipakai "<nama>.png".
Mau bahasa baru? Tambah kamus di bawah, jalankan ketiga skrip dengan CARD_LANG=<kode>, lalu daftarkan kode di lib/i18n.js.
"""
import os

LANG = os.environ.get("CARD_LANG", "id")

EN = {
    "NAMA": "NAME", "UMUR": "AGE", "NO. WHATSAPP": "WHATSAPP NO.", "NO. KARTU": "CARD NO.", "TERDAFTAR": "REGISTERED",
    "Kartu diterbitkan otomatis oleh Miyako - BA  ·  zavedya.id": "Card issued automatically by Miyako - BA  ·  zavedya.id",
    "SELAMAT BERGABUNG  ·  MEMBER BARU": "WELCOME ABOARD  ·  NEW MEMBER",
    "GRUP": "GROUP", "BERGABUNG": "JOINED",
    "SAMPAI JUMPA  ·  TERIMA KASIH SUDAH BERGABUNG": "SEE YOU  ·  THANKS FOR JOINING",
    "DARI GRUP": "FROM GROUP", "SISA MEMBER": "MEMBERS LEFT", "KELUAR": "LEFT AT",
    "SELAMAT  ·  KAMU NAIK LEVEL": "CONGRATS  ·  YOU LEVELED UP",
    "SEBELUM": "BEFORE", "SEKARANG": "NOW",
    "Semoga betah dan nyaman di sini ya!": "Hope you enjoy your stay here!",
    "Jangan lupa baca deskripsi & aturan grup.": "Don't forget to read the group description & rules.",
    "Terima kasih sudah pernah bersama kami.": "Thank you for being with us.",
    "Sampai bertemu lagi di lain waktu!": "See you again some time!",
    "Mantap! Terus aktif untuk naik ke level berikutnya.": "Nice! Keep chatting to reach the next level.",
    "Makin tinggi level, makin banyak keseruannya.": "The higher your level, the more fun you unlock.",
    "MIYAKO - BA   ·   KARTU PEMAIN": "MIYAKO - BA   ·   PLAYER CARD",
    "MIYAKO - BA   ·   KARTU PETUALANG": "MIYAKO - BA   ·   ADVENTURER CARD",
    "PROFIL": "PROFILE", "GELAR": "TITLE", "HASIL": "RESULT",
    "SALDO BANK": "BANK BALANCE", "DOMPET": "WALLET", "TOTAL ASET": "TOTAL ASSETS",
    "BUNGA HARIAN": "DAILY INTEREST", "LIMIT BANK": "BANK LIMIT",
    "BANK MIYAKO   ·   SIMPAN  ·   TARIK  ·   TRANSFER": "MIYAKO BANK   ·   DEPOSIT  ·   WITHDRAW  ·   TRANSFER",
}
TABLES = {"en": EN}

def tr(text):
    return TABLES.get(LANG, {}).get(text, text)

def out_path(path):
    return path if LANG == "id" else path.replace(".png", f".{LANG}.png")

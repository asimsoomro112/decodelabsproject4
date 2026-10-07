#!/usr/bin/env python3
"""Generate frontend/assets/og-cover.png (1200x630) with PIL only.

Run: python3 scripts/make-og-cover.py
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

W, H = 1200, 630
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "frontend", "assets", "og-cover.png")

def font(name, size):
    return ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans%s.ttf" % name, size)

# --- base: vertical espresso gradient ---
img = Image.new("RGB", (W, H))
px = img.load()
top = (64, 48, 39); mid = (30, 22, 17); bot = (17, 13, 11)
for y in range(H):
    t = y / H
    if t < .5:
        c = tuple(int(top[i] + (mid[i] - top[i]) * t * 2) for i in range(3))
    else:
        c = tuple(int(mid[i] + (bot[i] - mid[i]) * (t - .5) * 2) for i in range(3))
    for x in range(W):
        px[x, y] = c
img = img.convert("RGBA")

# --- aurora blobs ---
blobs = Image.new("RGBA", (W, H), (0, 0, 0, 0))
bd = ImageDraw.Draw(blobs)
bd.ellipse([-140, -200, 380, 320], fill=(165, 133, 111, 105))
bd.ellipse([800, 310, 1400, 830], fill=(160, 212, 224, 85))
bd.ellipse([400, 80, 840, 520], fill=(122, 86, 72, 80))
blobs = blobs.filter(ImageFilter.GaussianBlur(70))
img = Image.alpha_composite(img, blobs)

# --- faint grid with radial mask ---
grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(grid)
for gx in range(0, W, 48):
    gd.line([gx, 0, gx, H], fill=(255, 255, 255, 22))
for gy in range(0, H, 48):
    gd.line([0, gy, W, gy], fill=(255, 255, 255, 22))
mask = Image.new("L", (W, H), 0)
md = ImageDraw.Draw(mask)
md.ellipse([W/2 - 380, H/2 - 260, W/2 + 380, H/2 + 260], fill=110)
mask = mask.filter(ImageFilter.GaussianBlur(60))
img = Image.composite(grid, img, mask)
img = Image.alpha_composite(img.convert("RGBA"), Image.new("RGBA", (W, H), (0, 0, 0, 0)))

d = ImageDraw.Draw(img)

# --- bridge fibers ---
def fiber(y1, color, width, dash=False):
    pts = []
    for i in range(101):
        t = i / 100
        x = 170 + t * 860
        y = (1 - t) ** 2 * 330 + 2 * (1 - t) * t * y1 + t ** 2 * 330
        pts.append((x, y))
    if dash:
        for i in range(0, 100, 5):
            d.line([pts[i], pts[min(i + 2, 100)]], fill=color, width=width)
    else:
        d.line(pts, fill=color, width=width, joint="curve")

fiber(250, (160, 212, 224, 80), 3)
fiber(460, (165, 133, 111, 75), 3)
fiber(330, (242, 240, 234, 45), 2, dash=True)

# --- nodes ---
def node(cx, label, sub, c1, c2, tcol):
    d.ellipse([cx - 84, 330 - 84, cx + 84, 330 + 84], fill=c1 + (36,))
    d.ellipse([cx - 70, 330 - 70, cx + 70, 330 + 70], fill=c1 + (70,))
    d.ellipse([cx - 58, 330 - 58, cx + 58, 330 + 58], fill=c2 + (255,))
    d.ellipse([cx - 44, 330 - 44, cx + 44, 330 + 44], fill=c1 + (255,))
    f = font("-Bold", 24)
    bb = d.textbbox((0, 0), label, font=f)
    d.text((cx - (bb[2] - bb[0]) / 2, 330 - (bb[3] - bb[1]) / 2 - bb[1]), label, font=f, fill=tcol)
    fs = font("", 16)
    bb2 = d.textbbox((0, 0), sub, font=fs)
    d.text((cx - (bb2[2] - bb2[0]) / 2, 414), sub, font=fs, fill=(242, 240, 234, 160))

node(130, "UI", "BROWSER", (160, 212, 224), (74, 116, 130), (16, 46, 54))
node(1070, "API", "SERVER", (165, 133, 111), (100, 70, 55), (43, 28, 18))

# --- packets with glow ---
def packet(t, y1, color):
    x = 170 + t * 860
    y = (1 - t) ** 2 * 330 + 2 * (1 - t) * t * y1 + t ** 2 * 330
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(glow).ellipse([x - 26, y - 26, x + 26, y + 26], fill=color + (80,))
    glow = glow.filter(ImageFilter.GaussianBlur(9))
    global img, d
    img = Image.alpha_composite(img, glow)
    d = ImageDraw.Draw(img)
    d.ellipse([x - 11, y - 11, x + 11, y + 11], fill=color + (255,))

packet(0.60, 250, (52, 211, 153))
packet(0.28, 460, (160, 212, 224))
packet(0.82, 330, (251, 191, 36))

# --- text ---
def centered(y, text, fnt, fill):
    bb = d.textbbox((0, 0), text, font=fnt)
    d.text(((W - (bb[2] - bb[0])) / 2, y), text, font=fnt, fill=fill)

centered(96, "DECODELABS  \u00b7  PROJECT 4", font("-Bold", 21), (160, 212, 224, 255))

title = "SynapseBridge"
tf = font("-Bold", 88)
tw = d.textlength(title, font=tf)
x0 = (W - tw) / 2
cA = (160, 212, 224); cB = (242, 240, 234); cC = (232, 190, 150)
x = x0
for i, ch in enumerate(title):
    t = i / max(1, len(title) - 1)
    if t < .5:
        c = tuple(int(cA[j] + (cB[j] - cA[j]) * t * 2) for j in range(3))
    else:
        c = tuple(int(cB[j] + (cC[j] - cB[j]) * (t - .5) * 2) for j in range(3))
    d.text((x, 150), ch, font=tf, fill=c + (255,))
    x += d.textlength(ch, font=tf)
# soft shadow pass underneath
sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sd = ImageDraw.Draw(sh)
sd.text((x0 + 3, 153), title, font=tf, fill=(0, 0, 0, 110))
sh = sh.filter(ImageFilter.GaussianBlur(6))
img = Image.alpha_composite(sh, img)
d = ImageDraw.Draw(img)
# redraw title on top (shadow is beneath now)
x = x0
for i, ch in enumerate(title):
    t = i / max(1, len(title) - 1)
    if t < .5:
        c = tuple(int(cA[j] + (cB[j] - cA[j]) * t * 2) for j in range(3))
    else:
        c = tuple(int(cB[j] + (cC[j] - cB[j]) * (t - .5) * 2) for j in range(3))
    d.text((x, 150), ch, font=tf, fill=c + (255,))
    x += d.textlength(ch, font=tf)

centered(272, "Frontend \u2194 Backend Integration \u2014 every request, visible.", font("", 29), (242, 240, 234, 235))

badges = ["REST", "async / await", "CORS", "RFC 9457", "IDEMPOTENCY"]
bf = font("-Bold", 17)
widths = [d.textlength(b, font=bf) + 44 for b in badges]
total = sum(widths) + 14 * (len(badges) - 1)
x = (W - total) / 2
for b, w in zip(badges, widths):
    d.rounded_rectangle([x, 348, x + w, 390], radius=21, outline=(255, 255, 255, 75), width=2)
    bb = d.textbbox((0, 0), b, font=bf)
    d.text((x + (w - (bb[2] - bb[0])) / 2, 348 + (42 - (bb[3] - bb[1])) / 2 - bb[1]), b, font=bf, fill=(242, 240, 234, 255))
    x += w + 14

centered(560, "MUHAMMAD ASIM  \u00b7  FULL STACK DEVELOPMENT  \u00b7  BATCH 2026", font("", 16), (242, 240, 234, 130))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.convert("RGB").save(OUT, "PNG")
print("wrote", OUT, img.size)

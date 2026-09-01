"""OGP画像（1200x630）を生成する。

実行:  python scripts/gen-og-image.py
前提:  npm run fonts:fetch で fonts-src/ が取得済みであること

生成物 public/og.png はリポジトリにコミットする静的素材で、
サイトのビルドはこのスクリプトに依存しない（＝Pythonは通常不要）。
ブランド要素を変えたときだけ手で回す。

見た目はトップページのヒーローに揃える。CSS側の
  opacity 0.72 / brightness(0.72) contrast(1.5) saturate(1.05)
と同じ計算をここでも再現している。
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
W, H = 1200, 630

# --- デザイントークン（src/styles/tokens.css と同じ値） ---
C_VOID = (0, 0, 0)
C_FLUORESCENT = (242, 240, 255)
C_DUST = (139, 135, 163)

BRIGHTNESS = 0.72
CONTRAST = 1.5
SATURATE = 1.05
IMAGE_OPACITY = 0.72


def cover_crop(im: Image.Image, w: int, h: int) -> Image.Image:
    """object-fit: cover 相当"""
    src_ratio = im.width / im.height
    dst_ratio = w / h
    if src_ratio > dst_ratio:
        new_w = int(im.height * dst_ratio)
        box = ((im.width - new_w) // 2, 0, (im.width + new_w) // 2, im.height)
    else:
        new_h = int(im.width / dst_ratio)
        box = (0, (im.height - new_h) // 2, im.width, (im.height + new_h) // 2)
    return im.crop(box).resize((w, h), Image.LANCZOS)


def apply_css_filters(im: Image.Image) -> Image.Image:
    """CSS の brightness → contrast → saturate と同じ順・同じ式で適用する"""
    lut = []
    for i in range(256):
        v = i / 255.0
        v = v * BRIGHTNESS
        v = (v - 0.5) * CONTRAST + 0.5
        lut.append(max(0, min(255, round(v * 255))))
    im = im.point(lut * 3)
    return ImageEnhance.Color(im).enhance(SATURATE)


def composite_over_void(im: Image.Image, opacity: float) -> Image.Image:
    base = Image.new("RGB", im.size, C_VOID)
    return Image.blend(base, im, opacity)


def left_scrim(im: Image.Image) -> Image.Image:
    """文字が乗る左側を暗くする。ヒーローのスクリムと同じ考え方。"""
    mask = Image.new("L", im.size)
    px = mask.load()
    for x in range(im.width):
        t = x / im.width
        if t <= 0.40:
            a = 235 - (235 - 150) * (t / 0.40)
        elif t <= 0.75:
            a = 150 * (1 - (t - 0.40) / 0.35)
        else:
            a = 0
        for y in range(im.height):
            px[x, y] = int(a)
    return Image.composite(Image.new("RGB", im.size, C_VOID), im, mask)


def load_display(size: int) -> ImageFont.FreeTypeFont:
    """Archivo を wdth 80 / wght 700 に固定して読む（サイト側と同じ体裁）"""
    f = ImageFont.truetype(str(ROOT / "fonts-src" / "Archivo.ttf"), size)
    f.set_variation_by_axes([700, 80])  # [Weight, Width]
    return f


def main() -> None:
    hero = Image.open(ROOT / "src" / "assets" / "hero.png").convert("RGB")
    canvas = left_scrim(
        composite_over_void(apply_css_filters(cover_crop(hero, W, H)), IMAGE_OPACITY)
    )

    draw = ImageDraw.Draw(canvas)
    title = load_display(108)
    mono = ImageFont.truetype(str(ROOT / "fonts-src" / "IBMPlexMono-Regular.ttf"), 30)

    x = 72
    draw.text((x, 214), "Mawo's", font=title, fill=C_FLUORESCENT)
    draw.text((x, 322), "Portfolio", font=title, fill=C_FLUORESCENT)
    draw.text((x, 452), "Developer / ML Engineer", font=mono, fill=C_DUST)

    # 中身は写真なので JPEG。PNG だと同じ絵で4倍以上重くなる。
    out = ROOT / "public" / "og.jpg"
    canvas.save(out, "JPEG", quality=82, optimize=True, progressive=True)
    print(f"{out.relative_to(ROOT)}: {out.stat().st_size / 1024:.1f}KB ({W}x{H})")


if __name__ == "__main__":
    main()

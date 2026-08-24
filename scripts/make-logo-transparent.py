"""Remove ONLY the light/white background plate from logos/logoHugin.png.

- Does not recolor the bird or text
- Leaves logos/logoHugin.png untouched
- Writes public/logo-app.png
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

SRC = Path("logos/logoHugin.png")
OUT = Path("public/logo-app.png")
MIN_L = 218
MAX_CHROMA = 28


def is_plate(r: int, g: int, b: int, a: int) -> bool:
    if a == 0:
        return True
    if min(r, g, b) < MIN_L:
        return False
    return (max(r, g, b) - min(r, g, b)) <= MAX_CHROMA


def clear_plate(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    px = rgba.load()
    w, h = rgba.size
    vis = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        i = y * w + x
        if vis[i]:
            return
        r, g, b, a = px[x, y]
        if not is_plate(r, g, b, a):
            return
        vis[i] = 1
        q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)
    for y in range(h):
        for x in range(w):
            push(x, y)

    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        if x > 0:
            push(x - 1, y)
        if x + 1 < w:
            push(x + 1, y)
        if y > 0:
            push(x, y - 1)
        if y + 1 < h:
            push(x, y + 1)

    return rgba


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing {SRC}")
    src = Image.open(SRC)
    print(f"source: {SRC} size={src.size} corner={src.getpixel((0, 0))}")
    out = clear_plate(src)
    a = out.split()[3].tobytes()
    print(f"alpha0_pct={100 * a.count(0) / len(a):.1f} corner={out.getpixel((0, 0))}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, format="PNG", optimize=True)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes); source untouched")


if __name__ == "__main__":
    main()

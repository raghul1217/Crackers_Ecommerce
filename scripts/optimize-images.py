"""
optimize-images.py
Converts all site images to WebP (downscaled) and re-encodes hero videos.
Run from project root:  python scripts/optimize-images.py

- Every .jpg/.jpeg/.png under images/ -> <name>.webp (originals kept as backup)
- Every .mp4 under images/ -> re-encoded in place (libx264, no audio)
"""
import os
import subprocess
from PIL import Image

ROOT = 'images'
WEBP_QUALITY = 80
PRODUCT_SIZE = 600        # product/category cards (1024 -> 600)
GIFTBOX_MAX_W = 500
LOGO_SIZE = 256

def find_ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return 'ffmpeg'

def convert_image(path, out, max_size=None):
    im = Image.open(path)
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
    else:
        im = im.convert('RGB')
    if max_size:
        w, h = im.size
        if max(w, h) > max_size:
            if w >= h:
                im = im.resize((max_size, int(h * max_size / w)), Image.LANCZOS)
            else:
                im = im.resize((int(w * max_size / h), max_size), Image.LANCZOS)
    im.save(out, 'WEBP', quality=WEBP_QUALITY, method=6)
    return im.size

def convert_mp4(ffmpeg, path):
    tmp = path + '.tmp.mp4'
    cmd = [
        ffmpeg, '-y', '-i', path,
        '-c:v', 'libx264', '-crf', '30', '-preset', 'medium',
        '-vf', "scale='min(960,iw)':-2", '-pix_fmt', 'yuv420p',
        '-an', '-movflags', '+faststart', tmp,
    ]
    r = subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if r.returncode == 0 and os.path.exists(tmp):
        os.replace(tmp, path)
        return True
    if os.path.exists(tmp):
        os.remove(tmp)
    return False

def main():
    ffmpeg = find_ffmpeg()
    stats = {'webp': 0, 'mp4': 0, 'skipped': 0}
    saved_webp = 0

    for dirpath, _dirs, files in os.walk(ROOT):
        for f in sorted(files):
            full = os.path.join(dirpath, f)
            base, ext = os.path.splitext(f)
            low = ext.lower()

            if low in ('.jpg', '.jpeg', '.png'):
                out = os.path.join(dirpath, base + '.webp')
                if os.path.exists(out):
                    stats['skipped'] += 1
                    continue
                size_before = os.path.getsize(full)
                parts = set(dirpath.replace('\\', '/').split('/'))
                in_cat = 'categories' in parts
                in_gbox = 'giftbox' in parts
                if in_cat and 'ground-chakkars' in base:
                    max_size = LOGO_SIZE
                elif in_gbox:
                    max_size = GIFTBOX_MAX_W
                elif 'hero-banner' in base:
                    max_size = None
                elif in_cat or low in ('.jpg', '.jpeg'):
                    max_size = PRODUCT_SIZE
                else:
                    max_size = None
                try:
                    dims = convert_image(full, out, max_size)
                    size_after = os.path.getsize(out)
                    saved_webp += size_before - size_after
                    stats['webp'] += 1
                    print(f'{"OK":>3} {full} ({size_before/1024:7.1f}KB -> {size_after/1024:6.1f}KB) {dims}')
                except Exception as e:
                    print(f'ERR {full}: {e}')

            elif low == '.mp4':
                size_before = os.path.getsize(full)
                if convert_mp4(ffmpeg, full):
                    size_after = os.path.getsize(full)
                    saved_webp += size_before - size_after
                    stats['mp4'] += 1
                    print(f'{"OK":>3} {full} ({size_before/1024:7.1f}KB -> {size_after/1024:6.1f}KB)')
                else:
                    print(f'ERR {full}: ffmpeg failed')

    print(f'\nDone: {stats["webp"]} WebP created, {stats["mp4"]} MP4 re-encoded, {stats["skipped"]} skipped')
    print(f'Total bytes saved: {saved_webp/1024/1024:.1f} MB')

if __name__ == '__main__':
    main()

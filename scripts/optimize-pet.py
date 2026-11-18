"""离线压缩既有桌宠素材；需要 Pillow 13.0.0 和 imagequant 1.1.6。"""
from pathlib import Path

from PIL import Image
import imagequant


root = Path(__file__).resolve().parent.parent
source = root / 'assets/pet/DSniang1.png'
target = root / 'assets/pet/DSniang1-256.png'

# 最大显示 128 点，保留两倍像素；量化时同时保留半透明边缘。
with Image.open(source) as original:
    resized = original.convert('RGBA').resize((256, 256), Image.Resampling.LANCZOS)
result = imagequant.quantize_pil_image(
    resized, max_colors=128, min_quality=85, max_quality=95, dithering_level=.5,
)
result.save(target, optimize=True, compress_level=9)
print(f'{source.stat().st_size} → {target.stat().st_size} bytes')

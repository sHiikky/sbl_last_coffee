import json
import math
import pathlib
import textwrap
import unicodedata

from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageOps, ImageStat

ROOT = pathlib.Path(__file__).parent
ORIGINALS = pathlib.Path(r'F:\РАБОТА\SBL_COFFEE\новое меню и все фото\SBL Фото')
checks = json.loads((ROOT / 'photo-link-checks.json').read_text(encoding='utf-8'))


def normalized(path):
    with Image.open(path) as source:
        source = ImageOps.exif_transpose(source).convert('RGBA')
        white = Image.new('RGBA', source.size, 'white')
        white.alpha_composite(source)
        image = white.convert('RGB')
        mask = ImageChops.difference(image, Image.new('RGB', image.size, 'white')).convert('L')
        bbox = mask.point(lambda value: 255 if value > 20 else 0).getbbox()
        if bbox:
            image = image.crop(bbox)
        return image.resize((96, 96), Image.Resampling.LANCZOS)


original_files = sorted(ORIGINALS.rglob('*.png'))
original_images = [(path, normalized(path)) for path in original_files]
# Light glass edges and removed shadows make bounding-box pixel matching
# unreliable for these tall drinks. These source pairs were reviewed visually.
visual_source_stems = {
    'aperol': 'Апероль шпирц',
    'espresso-tonic': 'Эспрессо тоник',
    'ice-latte': 'Айс латте',
    'matcha-jasmine': 'Матча жасмин',
    'pink-drink-matcha': 'Пинк дринк',
    'protein-smoothie': 'Протеиновый смузи',
    'strawberry-ube': 'Земляничный уе',
}
files_by_stem = {unicodedata.normalize('NFC', p.stem).lower(): p for p in original_files}
matches = []
for entry in checks['results']:
    if not entry.get('file'):
        continue
    local = ROOT / entry['file']
    target = normalized(local)
    scores = []
    for path, candidate in original_images:
        error = sum(ImageStat.Stat(ImageChops.difference(target, candidate)).mean) / 3
        scores.append((round(error, 4), str(path.relative_to(ORIGINALS))))
    scores.sort()
    slug = local.stem.rsplit('-', 1)[0]
    reviewed_original = (
        str(files_by_stem[visual_source_stems[slug].lower()].relative_to(ORIGINALS))
        if slug in visual_source_stems else scores[0][1]
    )
    with Image.open(local) as image:
        dimensions = list(image.size)
    matches.append({
        'file': entry['file'], 'products': entry['products'], 'dimensions': dimensions,
        'nearest': [{'meanAbsolutePixelError': score, 'original': name} for score, name in scores[:3]],
        'reviewedOriginal': reviewed_original,
        'reviewMethod': 'visual source and menu comparison' if slug in visual_source_stems else 'normalized pixel and menu comparison',
    })

(ROOT / 'photo-source-matches.json').write_text(json.dumps(matches, ensure_ascii=False, indent=2), encoding='utf-8')

font = ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf', 17)
small_font = ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf', 14)
for start in range(0, len(matches), 15):
    subset = matches[start:start + 15]
    sheet = Image.new('RGB', (1250, 920), 'white')
    draw = ImageDraw.Draw(sheet)
    for index, entry in enumerate(subset):
        x = (index % 5) * 250
        y = (index // 5) * 306
        with Image.open(ROOT / entry['file']) as source:
            rgba = source.convert('RGBA')
            rgba.thumbnail((224, 195), Image.Resampling.LANCZOS)
            sheet.paste(rgba, (x + (250 - rgba.width) // 2, y + 5), rgba)
        label = ' / '.join(p['name'] for p in entry['products'])
        for line_index, line in enumerate(textwrap.wrap(label, width=25)[:3]):
            draw.text((x + 8, y + 204 + line_index * 19), line, fill='black', font=font)
        best = entry['nearest'][0]
        draw.text((x + 8, y + 267), pathlib.Path(entry['reviewedOriginal']).name[:29], fill='#235023', font=small_font)
        draw.text((x + 8, y + 286), f"MAE {best['meanAbsolutePixelError']}", fill='#444444', font=small_font)
    sheet.save(ROOT / f'photos-sheet-{start // 15 + 1}.jpg', quality=90)

print(json.dumps({
    'comparedImages': len(matches),
    'largestNearestError': max(m['nearest'][0]['meanAbsolutePixelError'] for m in matches),
    'matches': [{
        'products': [p['name'] for p in m['products']],
        'original': m['nearest'][0]['original'],
        'error': m['nearest'][0]['meanAbsolutePixelError'],
    } for m in matches],
}, ensure_ascii=False, indent=2))

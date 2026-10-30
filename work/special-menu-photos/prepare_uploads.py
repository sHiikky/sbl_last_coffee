"""Prepare lossless Storage copies. No remote writes and no original edits."""
import hashlib
import io
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent
mapping = json.loads((root / 'local-photo-menu-map.json').read_text(encoding='utf-8'))
catalog = json.loads((root / 'catalog-current.json').read_text(encoding='utf-8'))
source = Path(mapping['sourceDirectory']).resolve()
output = root / 'upload-ready'
output.mkdir(exist_ok=True)
slugs = [
    'kiwi-raspberry-mint', 'protein-matcha-banana', 'raf-banoffee',
    'masala-tea', 'siberian-mulled-drink', 'cedar-raspberry-cappuccino',
    'bueno-white-chocolate-latte', 'seabuckthorn-romario', 'vitamin-shot',
]

def normalized(value):
    return ' '.join(''.join(c if c.isalnum() else ' ' for c in value.casefold().replace('ё', 'е')).split())

photos = []
for item, slug in zip(mapping['photos'], slugs, strict=True):
    original = (source / item['file']).resolve()
    if original.parent != source:
        raise ValueError('Source file outside the supplied folder')
    original_bytes = original.read_bytes()
    source_hash = hashlib.sha256(original_bytes).hexdigest()
    with Image.open(original) as image:
        rgba = image.convert('RGBA')
        encoded = io.BytesIO()
        options = {'format': 'WEBP', 'lossless': True, 'exact': True, 'quality': 100, 'method': 6}
        if image.info.get('icc_profile'):
            options['icc_profile'] = image.info['icc_profile']
        rgba.save(encoded, **options)
        webp = encoded.getvalue()
        with Image.open(io.BytesIO(webp)) as decoded:
            if decoded.convert('RGBA').tobytes() != rgba.tobytes():
                raise ValueError(f'Lossless pixel verification failed: {item["file"]}')
        dimensions = list(rgba.size)
    webp_hash = hashlib.sha256(webp).hexdigest()
    filename = f'special-{slug}-{webp_hash[:10]}.webp'
    (output / filename).write_bytes(webp)
    if hashlib.sha256(original.read_bytes()).hexdigest() != source_hash:
        raise ValueError('An original source changed during preparation')
    matches = [p for p in catalog['rows'] if not p['is_modifier'] and normalized(p['display_name'] or p['name']) == normalized(item['menuName'])]
    exact = matches[0] if len(matches) == 1 else None
    photos.append({
        'menuName': item['menuName'], 'sourceFile': item['file'],
        'sourceSha256': source_hash, 'sourceBytes': len(original_bytes),
        'storageBucket': 'product-photos', 'storageFilename': filename,
        'sha256': webp_hash, 'bytes': len(webp), 'dimensions': dimensions,
        'losslessPixelsVerified': True, 'preservesAlpha': True,
        'plannedPublicUrl': f'https://{catalog["project"]}.supabase.co/storage/v1/object/public/product-photos/{filename}',
        'productId': exact['id'] if exact else None,
        'sbisId': exact['sbis_id'] if exact else None,
        'currentImageOverrideUrl': exact['image_override_url'] if exact else None,
        'status': 'exact_catalog_name_match' if exact else 'requires_sbis_identity',
    })
result = {
    'project': catalog['project'], 'localPreparationOnly': True,
    'remoteUploadPerformed': False, 'databaseChangesPerformed': False,
    'pricesNotImportedFromMenuImage': True,
    'sourceBytes': sum(p['sourceBytes'] for p in photos),
    'uploadBytes': sum(p['bytes'] for p in photos), 'photos': photos,
}
(root / 'upload-manifest.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({k: v for k, v in result.items() if k != 'photos'}, ensure_ascii=False))

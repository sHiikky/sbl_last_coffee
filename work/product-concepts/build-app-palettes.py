import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[2]
rows = json.loads((root/'work/special-menu-photos/catalog-current.json').read_text(encoding='utf-8'))['rows']
photos = {}
for row in rows:
    url = row.get('image_override_url')
    if not url or url in photos: continue
    filename = url.rsplit('/', 1)[-1]
    path = root/'work/photo-audit/downloaded'/filename
    if not path.is_file(): continue
    image = Image.open(path).convert('RGBA')
    stem = filename.split('-')
    cup = filename.startswith(('matcha-blue-', 'matcha-latte-', 'matcha-pistachio-', 'ube-latte-', 'pomegranate-coffee-', 'raf-', 'bumble-', 'latte-coconut-', 'cherry-latte-', 'siberian-tea-'))
    food = row.get('menu_category') == 'Еда'
    roi = (.13,.05,.74,.16) if cup else ((.1,.1,.8,.8) if food else (.15,.16,.65,.6))
    if filename.startswith('tea-'): roi = (.15,.3,.5,.45)
    w,h = image.size
    x,y,rw,rh = roi
    sample = image.crop((int(w*x),int(h*y),int(w*(x+rw)),int(h*(y+rh)))).resize((64,64))
    pixels = [v for pixel in sample.getdata() for v in pixel]
    config = {'fallback':32}
    if filename.startswith('matcha-') and not filename.startswith(('matcha-blue-','matcha-jasmine-')): config.update(fallback=98,toneRange=[94,125])
    if filename.startswith('ube-latte-'): config.update(fallback=285,toneRange=[272,290])
    if filename.startswith('matcha-blue-'): config['fallback']=198
    photos[url] = {'pixels':pixels,'config':config,'filename':filename,'width':w,'height':h,'region':roi}
(root/'work/product-concepts/palette-pixels.json').write_text(json.dumps(photos),encoding='utf-8')
print(f'Prepared liquid/food samples for {len(photos)} existing photos; source files unchanged')

from pathlib import Path
import base64,json,re
prefix=Path('work/product-concepts/style-lab/prepare-fonts.py').read_text(encoding='utf-8-sig').split('css=[]')[0]
exec(prefix)
family_names={'nunito':'Nunito','comfortaa':'Comfortaa','mplusrounded1c':'M PLUS Rounded 1c','zenmarugothic':'Zen Maru Gothic','jura':'Jura','balsamiqsans':'Balsamiq Sans'}
css=[];rows=[]
for slug,name in family_names.items():
 data=(root/(slug+'.ttf')).read_bytes()
 tables={data[12+i*16:16+i*16].decode():u32(data,20+i*16) for i in range(u16(data,4))}
 missing=[c for c in 'АйсЛаттеКофеСерияБонусыЁёЖжикьъыэюя0123456789' if not glyph_present(data,tables,ord(c))]
 assert not missing,(name,missing)
 faces=[]
 for p in sorted(root.glob(slug+'-subset-*.font')):
  weight=int(p.stem.split('-')[-1]);b=p.read_bytes();fmt='woff2' if b[:4]==b'wOF2' else 'woff' if b[:4]==b'wOFF' else 'truetype'
  css.append('@font-face{font-family:"'+name+'";font-style:normal;font-weight:'+str(weight)+';font-display:swap;src:url(data:font/'+fmt+';base64,'+base64.b64encode(b).decode()+') format("'+fmt+'");}')
  faces.append({'weight':weight,'format':fmt,'file':p.name,'bytes':len(b)})
 assert len(faces)>=2,name
 meta=(root/(slug+'-METADATA.pb')).read_text()
 row={'id':slug,'name':name,'source':'https://github.com/google/fonts/tree/main/ofl/'+slug,'license':re.search(r'license: "([^"]+)"',meta).group(1),'cyrillic':True,'ruble':glyph_present(data,tables,0x20bd),'faces':faces}
 rows.append(row);print(name,'Cyrillic verified;',sum(x['bytes'] for x in faces),'bytes; faces',[x['weight'] for x in faces])
(root.parent/'fonts-rounded.css').write_bytes('\n'.join(css).encode('utf-8'))
(root/'rounded-sources.json').write_bytes(json.dumps(rows,ensure_ascii=False,indent=2).encode('utf-8'))

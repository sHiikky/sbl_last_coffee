from pathlib import Path
import base64,json,struct,re
root=Path('work/product-concepts/style-lab/fonts')
rows=json.loads((root/'sources.json').read_text(encoding='utf-8-sig'))
def u16(b,p):return struct.unpack_from('>H',b,p)[0]
def u32(b,p):return struct.unpack_from('>I',b,p)[0]
def glyph_present(data,tables,cp):
  c=tables['cmap'];n=u16(data,c+2)
  for i in range(n):
    sub=c+u32(data,c+4+i*8+4);fmt=u16(data,sub)
    if fmt==12:
      for j in range(u32(data,sub+12)):
        start,end,glyph=struct.unpack_from('>III',data,sub+16+j*12)
        if start<=cp<=end and glyph+cp-start:return True
    elif fmt==4 and cp<65536:
      count=u16(data,sub+6)//2;ends=sub+14;starts=ends+2*count+2;deltas=starts+2*count;ranges=deltas+2*count
      for j in range(count):
        if u16(data,starts+j*2)<=cp<=u16(data,ends+j*2):
          r=u16(data,ranges+j*2);d=u16(data,deltas+j*2)
          glyph=(cp+d)&65535 if r==0 else u16(data,ranges+j*2+r+2*(cp-u16(data,starts+j*2)))
          if glyph:return True
  return False
css=[]
for row in rows:
  data=(root/(row['id']+'.ttf')).read_bytes()
  tables={data[12+i*16:16+i*16].decode():u32(data,20+i*16) for i in range(u16(data,4))}
  name=re.search(r'name: "([^"]+)"',(root/(row['id']+'-METADATA.pb')).read_text()).group(1)
  assert all(glyph_present(data,tables,ord(c)) for c in 'АйсЛаттеКофеСерияБонусыЁжикьъыэюя₽0123456789'),name
  axes={}
  if 'fvar' in tables:
    f=tables['fvar'];pos=f+u16(data,f+4)
    for i in range(u16(data,f+8)):
      a=pos+i*u16(data,f+10);tag=data[a:a+4].decode();values=struct.unpack_from('>iii',data,a+4);axes[tag]=[values[0]/65536,values[2]/65536]
  limits=axes.get('wght',[400,400]);row.update(name=name,axes=axes,weightRange=limits,cyrillic=True,ruble=True)
  css.append('@font-face{font-family:"'+name+'";font-style:normal;font-weight:'+str(int(limits[0]))+' '+str(int(limits[1]))+';font-display:swap;src:url(data:font/ttf;base64,'+base64.b64encode(data).decode()+') format("truetype")}')
  print(name,'Cyrillic/ruble verified; weights',limits)
(root.parent/'fonts.css').write_text('\n'.join(css),encoding='utf-8')
(root/'sources.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')

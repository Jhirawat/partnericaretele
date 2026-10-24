import {test,expect} from 'bun:test';
import {readFileSync,readdirSync} from 'node:fs';
import {pageHead,breadcrumbLd,organizationLd,websiteLd,INDEXABLE_PATHS,SITE_URL,canonical} from '../src/lib/seo';
const R='src/routes/';const src=(f:string)=>readFileSync(R+f,'utf8');
const walk=(d:string):string[]=>readdirSync(R+d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(d+e.name+'/'):/\.tsx?$/.test(e.name)?[d+e.name]:[]);
const pages=walk('').filter(f=>f.endsWith('.tsx')&&!f.includes('__root')&&!f.endsWith('route.tsx')&&f!=='preview/index.tsx'&&!f.startsWith('[.]lovable'));
test('indexable page has canonical, og:url and index robots; private has noindex and no canonical',()=>{
  const pub=pageHead({path:'/x',index:true,title:'T',thTitle:'ท',description:'D',thDescription:'ด'});
  expect(pub.links).toEqual([{rel:'canonical',href:SITE_URL+'/x'}]);expect(pub.meta).toContainEqual({property:'og:url',content:SITE_URL+'/x'});expect(pub.meta).toContainEqual({name:'robots',content:'index, follow'});
  const priv=pageHead({path:'/auth',index:false,title:'T',thTitle:'ท',description:'D',thDescription:'ด'});
  expect(priv.links).toEqual([]);expect(priv.meta).toContainEqual({name:'robots',content:'noindex, nofollow'});
  expect(pub.meta.find(m=>'title' in m)!['title']).toContain('ท | T');
});
test('JSON-LD is valid schema.org JSON and has no unverifiable claims',()=>{
  for(const x of [organizationLd,websiteLd,breadcrumbLd([{name:'a',path:'/'},{name:'b',path:'/b'}])]){const j=JSON.parse(JSON.stringify(x));expect(j['@context']).toBe('https://schema.org');expect(typeof j['@type']).toBe('string');}
  const s=JSON.stringify([organizationLd,websiteLd]);for(const bad of ['aggregateRating','award','priceRange','hasCredential','review','address','telephone'])expect(s).not.toContain(bad);
  expect(breadcrumbLd([{name:'a',path:'/'}]).itemListElement[0]!.item).toBe(canonical('/'));
});
test('only allow-listed routes are indexable or in the sitemap',()=>{
  for(const f of pages){const s=src(f);const path=f==='index.tsx'?'/':'/'+f.replace(/\.tsx$/,'').replace(/^_authenticated\//,'');
    const indexed=/sitemap:\s*true/.test(s);expect([f,indexed]).toEqual([f,(INDEXABLE_PATHS as readonly string[]).includes(path)]);
    if(!indexed)expect([f,/noindex|index:\s*false/.test(s)]).toEqual([f,true]);
    if(indexed)expect([f,/index:\s*true/.test(s)]).toEqual([f,true]);}
  expect(src('_authenticated/route.tsx')).toContain('"exclude-subtree"');
});
test('every public page has unique titles and descriptions',()=>{const t=pages.map(f=>src(f).match(/thTitle:\s*["']([^"']+)|title:\s*["']([^"']+)/)?.slice(1).find(Boolean)).filter(Boolean);expect(new Set(t).size).toBe(t.length);});
test('robots.txt allows public pages, blocks API, references sitemap',()=>{const r=readFileSync('public/robots.txt','utf8');expect(r).toContain('Disallow: /api/');expect(r).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);expect(r).not.toMatch(/^Disallow: \/$/m);});
test('no og:image without an absolute URL and none on root',()=>{expect(src('__root.tsx')).not.toContain('og:image');for(const f of pages){const m=src(f).match(/og:image["'],\s*content:\s*["']([^"']+)/);if(m)expect(m[1]!.startsWith('https://')).toBe(true);}});
test('accessibility smoke: icon buttons labelled, no positive tabindex, images have alt',()=>{
  const files=[...walk(''),...readdirSync('src/components').filter(f=>f.endsWith('.tsx')).map(f=>'../components/'+f)];
  for(const f of files){const s=src(f);
    for(const m of s.matchAll(/<Button\b/g)){const seg=s.slice(m.index,s.indexOf('</Button>',m.index));if(/size="icon"/.test(seg))expect([f,/aria-label/.test(seg)]).toEqual([f,true]);}
    expect([f,/tabIndex=\{[1-9]/.test(s)]).toEqual([f,false]);
    for(const m of s.matchAll(/<img\b[^>]*>/g))expect([f,/\balt=/.test(m[0])]).toEqual([f,true]);}
});

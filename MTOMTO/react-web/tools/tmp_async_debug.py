import requests, xml.etree.ElementTree as ET, re, json, asyncio, aiohttp
sitemap='https://www.treasurevalleycannabis.com/sitemap.xml'
r=requests.get(sitemap, headers={'User-Agent':'Mozilla/5.0'}, timeout=20)
root=ET.fromstring(r.text)
urls=[]
for loc in root.findall('.//{http://www.sitemaps.org/schemas/sitemap/0.9}loc'):
    if loc.text and '/product/' in loc.text:
        urls.append(loc.text.strip())
if not urls:
    for loc in root.findall('.//loc'):
        if loc.text and '/product/' in loc.text:
            urls.append(loc.text.strip())
urls=urls[:10]
print('DEBUG URL COUNT', len(urls))
async def check_one(u):
    try:
        timeout=aiohttp.ClientTimeout(total=30)
        conn=aiohttp.TCPConnector(ssl=False)
        async with aiohttp.ClientSession(timeout=timeout, connector=conn) as s:
            async with s.get(u, headers={'User-Agent':'Mozilla/5.0'}) as resp:
                txt=await resp.text()
                m=re.findall(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', txt, flags=re.S|re.I)
                print('\nURL:', u)
                print('STATUS', resp.status, 'LD TAGS', len(m))
                if m:
                    try:
                        j=json.loads(m[0])
                        if isinstance(j, dict) and '@graph' in j:
                            types=[node.get('@type') for node in j['@graph']]
                            print('GRAPH types:', types)
                            for node in j['@graph']:
                                if str(node.get('@type','')).lower()=='product':
                                    print('NAME:', node.get('name'))
                                    break
                        else:
                            print('JSON keys:', list(j.keys())[:10])
                    except Exception as e:
                        print('JSON parse error', e)
    except Exception as e:
        print('\nFETCH ERROR for', u, '->', e)

async def main():
    tasks=[check_one(u) for u in urls]
    await asyncio.gather(*tasks)

if __name__=='__main__':
    asyncio.run(main())

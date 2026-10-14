import asyncio, json, os, ssl, edge_tts, edge_tts.communicate as c
c._SSL_CTX = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
N=json.load(open('narr.json')); V="ko-KR-SunHiNeural"
async def say(t,o):
    if not t or os.path.exists(o): return
    await edge_tts.Communicate(t,V,rate="+5%",proxy=os.environ.get("HTTPS_PROXY")).save(o)
async def main():
    for k,v in N.items():
        await say(v['title'],f'tts/{k}-t.mp3'); await say(v['end'],f'tts/{k}-e.mp3')
        for i,s in enumerate(v['steps'],1): await say(s,f'tts/{k}-{i}.mp3')
asyncio.run(main())

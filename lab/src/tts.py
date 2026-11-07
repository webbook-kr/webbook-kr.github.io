import asyncio, json, os, ssl, edge_tts, edge_tts.communicate as c
c._SSL_CTX = ssl.create_default_context(cafile="/root/.ccr/ca-bundle.crt")
N=json.load(open('narr.json'))
async def main():
    for k,t in N.items():
        o=f'tts/{k}.mp3'
        if os.path.exists(o): continue
        await edge_tts.Communicate(t,"ko-KR-SunHiNeural",rate="+5%",proxy=os.environ.get("HTTPS_PROXY")).save(o)
asyncio.run(main())

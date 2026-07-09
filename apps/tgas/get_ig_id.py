import aiohttp
import asyncio

USER_TOKEN = "EAAXiSQRFDKMBR23rzCIPr4bP0FOzRVeU6gjP3LRCIZCfA7LdNmQlSz1XlYKzlLdZBsuvB5ByZClx9c9cTxoMW8upu1t0xnrdt2arapsZAVzA7hgsDCDAGjHFhTHlytWuGgL4P1yZCglDODkwgfEwbV1ySRf60JF9hXH4PMJvxXwEduICAjHBPmHFu7WKXPSCItPc6xXMLFmTxVQYZAZCmAYVxNaDAIreGajZAqyVeHnkZCN1VMdPXGPHN42w7noQ1D4KJU7Q2gjLszHm3zRg0UT8XagZDZD"
PAGE_ID = "768561956332372"

async def main():
    async with aiohttp.ClientSession() as s:
        async with s.get(
            f"https://graph.facebook.com/v18.0/{PAGE_ID}",
            params={"fields": "access_token", "access_token": USER_TOKEN}
        ) as r:
            data = await r.json()
            if "access_token" in data:
                print(data["access_token"])

asyncio.run(main())

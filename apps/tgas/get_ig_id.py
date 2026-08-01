import aiohttp
import asyncio
import os

USER_TOKEN = os.getenv("INSTAGRAM_USER_TOKEN") or os.getenv("INSTAGRAM_ACCESS_TOKEN")
PAGE_ID = os.getenv("FB_PAGE_ID", "768561956332372")

if not USER_TOKEN:
    raise SystemExit(
        "INSTAGRAM_USER_TOKEN (или INSTAGRAM_ACCESS_TOKEN) не задан в окружении"
    )


async def main() -> None:
    async with aiohttp.ClientSession() as s:
        async with s.get(
            f"https://graph.facebook.com/v18.0/{PAGE_ID}",
            params={"fields": "access_token", "access_token": USER_TOKEN},
        ) as r:
            data = await r.json()
            if "access_token" in data:
                print(data["access_token"])


asyncio.run(main())

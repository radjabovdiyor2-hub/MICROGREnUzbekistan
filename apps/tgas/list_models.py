import asyncio, json
from openai import AsyncOpenAI
from shared.config import settings

client = AsyncOpenAI(api_key=settings.openai_api_key)

async def main():
    models = await client.models.list()
    ids = [m.id for m in models.data]
    print(json.dumps(ids, indent=2))

asyncio.run(main())

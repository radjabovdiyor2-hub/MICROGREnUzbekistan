import asyncio
import aiohttp
from shared.config import settings

async def test() -> None:
    async with aiohttp.ClientSession() as session:
        # Step 1: Get Page Access Token
        url_page = f"https://graph.facebook.com/v18.0/{settings.facebook_page_id}?fields=access_token&access_token={settings.instagram_access_token}"
        async with session.get(url_page) as resp:
            page_data = await resp.json()
            print('PAGE DATA:', page_data)
            page_token = page_data.get('access_token')
            if page_token:
                print('Successfully retrieved page token!')
                # Step 2: Try uploading photo with page token
                url_photo = f"https://graph.facebook.com/v18.0/{settings.facebook_page_id}/photos"
                with open("temp_img.jpg", "rb") as f:
                    data = aiohttp.FormData()
                    data.add_field("source", f, filename="photo.jpg", content_type="image/jpeg")
                    data.add_field("access_token", page_token)
                    data.add_field("published", "false")
                    async with session.post(url_photo, data=data) as resp_photo:
                        print('PHOTO UPLOAD STATUS:', resp_photo.status)
                        print('PHOTO UPLOAD RESPONSE:', await resp_photo.json())
            else:
                print('Failed to retrieve page token.')

asyncio.run(test())

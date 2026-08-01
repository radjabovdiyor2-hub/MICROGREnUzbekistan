"""
Instagram Bot Setup — One-Click Configuration
==============================================
Takes a user token, converts to page token, subscribes to messaging events,
updates .env, and tests sending a message.

Usage: python setup_ig_bot.py <USER_TOKEN>
"""

import aiohttp
import asyncio
import os
import sys
import json
from dotenv import load_dotenv, set_key

env_path = os.path.abspath(r"C:\Users\TUF GAMING\Desktop\tgas\.env")
load_dotenv(env_path)

PAGE_ID = os.environ.get("FACEBOOK_PAGE_ID", "").strip("'\"")
IG_ID = os.environ.get("INSTAGRAM_ACCOUNT_ID", "").strip("'\"")

API_VERSION = "v19.0"
BASE = f"https://graph.facebook.com/{API_VERSION}"

REQUIRED_SCOPES = [
    "instagram_manage_messages",
    "pages_messaging",
    "pages_manage_metadata",
    "pages_show_list",
    "instagram_basic",
]


async def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python setup_ig_bot.py <USER_TOKEN>")
        print("Get token from Graph API Explorer with these permissions:")
        for s in REQUIRED_SCOPES:
            print(f"  - {s}")
        return

    user_token = sys.argv[1].strip("'\" ")

    async with aiohttp.ClientSession() as s:
        # Step 1: Validate token
        print("=" * 50)
        print("STEP 1: Validating token...")
        url = f"{BASE}/debug_token?input_token={user_token}&access_token={user_token}"
        async with s.get(url) as resp:
            data = await resp.json()

        if "error" in data or not data.get("data", {}).get("is_valid"):
            print("  FAIL: Token is invalid!")
            return

        scopes = data["data"].get("scopes", [])
        print(f"  Token type: {data['data'].get('type')}")
        print(f"  Scopes: {scopes}")

        missing = [sc for sc in REQUIRED_SCOPES if sc not in scopes]
        if missing:
            print(f"\n  MISSING REQUIRED SCOPES: {missing}")
            print("  Please add these in Graph API Explorer and regenerate token!")
            return

        print("  All required scopes present!")

        # Step 2: Exchange for page token
        print(f"\n{'=' * 50}")
        print("STEP 2: Exchanging for Page Token...")
        url2 = f"{BASE}/{PAGE_ID}?fields=access_token&access_token={user_token}"
        async with s.get(url2) as resp:
            data2 = await resp.json()

        if "access_token" not in data2:
            print(f"  FAIL: Could not get page token: {data2}")
            return

        page_token = data2["access_token"]
        print(f"  Page token obtained: {page_token[:30]}...")

        # Step 3: Save to .env
        print(f"\n{'=' * 50}")
        print("STEP 3: Saving to .env...")
        set_key(env_path, "INSTAGRAM_ACCESS_TOKEN", page_token)
        print("  .env updated!")

        # Step 4: Subscribe to messaging events
        print(f"\n{'=' * 50}")
        print("STEP 4: Subscribing to messaging events...")
        url4 = f"{BASE}/{PAGE_ID}/subscribed_apps"
        payload4 = {"subscribed_fields": "messages", "access_token": page_token}
        async with s.post(url4, data=payload4) as resp:
            data4 = await resp.json()

        if "error" in data4:
            print(f"  FAIL: {data4['error']['message']}")
            print("  Continuing anyway...")
        else:
            print(f"  Subscribed: {data4}")

        # Step 5: Get conversations and find recipient
        print(f"\n{'=' * 50}")
        print("STEP 5: Finding latest conversation...")
        url5 = f"{BASE}/{PAGE_ID}/conversations?platform=instagram&access_token={page_token}"
        async with s.get(url5) as resp:
            data5 = await resp.json()

        if not data5.get("data"):
            print("  No conversations found.")
            return

        conv_id = data5["data"][0]["id"]
        print(f"  Found conversation: {conv_id[:40]}...")

        # Get messages
        url5b = f"{BASE}/{conv_id}?fields=messages{{message,from,created_time}}&access_token={page_token}"
        async with s.get(url5b) as resp:
            data5b = await resp.json()

        messages = data5b.get("messages", {}).get("data", [])
        recipient = None
        for msg in messages:
            if msg.get("from", {}).get("username") != "microgreenuzbekistan":
                recipient = msg["from"]
                print(
                    f"  Latest sender: {recipient.get('username')} (ID: {recipient.get('id')})"
                )
                break

        if not recipient:
            print("  No customer messages found!")
            return

        # Step 6: Send test reply
        print(f"\n{'=' * 50}")
        print("STEP 6: Sending test reply...")
        url6 = f"{BASE}/{PAGE_ID}/messages"
        payload6 = {
            "recipient": {"id": recipient["id"]},
            "message": {
                "text": "Zdravstvuyte! Spasibo za vashe soobshchenie. Nash menedzher svyazhetsya s vami."
            },
            "messaging_type": "RESPONSE",
            "access_token": page_token,
        }
        async with s.post(url6, json=payload6) as resp:
            data6 = await resp.json()

        if "error" in data6:
            err = data6["error"]
            print(
                f"  FAIL: {err.get('code')}/{err.get('error_subcode', '?')}: {err.get('message', '?')}"
            )
        else:
            print("  SUCCESS! Message sent!")
            print(f"  Response: {json.dumps(data6, ensure_ascii=True)}")

        print(f"\n{'=' * 50}")
        print("SETUP COMPLETE!")


if __name__ == "__main__":
    asyncio.run(main())

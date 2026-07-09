import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'apps', 'bot'))

async def main():
    try:
        from services.ecosystem_bridge import bridge
        print("Testing EcosystemBridge.notify_stepan()...")
        
        # Test notification
        success = await bridge.notify_stepan(
            "🧪 **TEST**: System startup verification\n"
            "This is a test notification from the test suite to verify the bot separation."
        )
        
        if success:
            print("✅ notify_stepan() executed successfully. Stepan bot should have received the message.")
        else:
            print("❌ notify_stepan() failed.")
            
    except Exception as e:
        print(f"❌ Error during test: {e}")

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), 'apps', 'bot', '.env'))
    asyncio.run(main())

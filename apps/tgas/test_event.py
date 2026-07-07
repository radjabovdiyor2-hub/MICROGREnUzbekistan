import asyncio
from shared.config import settings
from shared.event_bus import EventBus

async def main():
    eb = EventBus()
    await eb.connect()
    await eb.publish("TASK_CREATED", {
        "task_id": 999,
        "title": "Test HR",
        "department": "hr",
        "priority": "high",
        "assignee": "HR-manager",
        "description": "Just a test",
        "chat_id": settings.admin_telegram_ids[0]
    }, "stepan")
    print("Published!")
    await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(main())

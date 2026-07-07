import asyncio
from shared.config import settings
from shared.event_bus import EventBus

depts = ["content", "sales", "pm", "marketing", "finance", "analytics", "support"]

async def main():
    eb = EventBus()
    await eb.connect()
    
    for i, dept in enumerate(depts):
        await eb.publish("TASK_CREATED", {
            "task_id": 1000 + i,
            "title": f"Test {dept}",
            "department": dept,
            "priority": "high",
            "assignee": "manager",
            "description": f"Just a test for {dept}",
            "chat_id": settings.admin_telegram_ids[0]
        }, "stepan")
        print(f"Published for {dept}")
        await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(main())

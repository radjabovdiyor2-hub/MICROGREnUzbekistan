import asyncio
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), 'apps', 'tgas'))
from shared.event_bus import event_bus

async def test_delegate():
    print("Publishing TASK_CREATED...")
    await event_bus.publish("TASK_CREATED", {
        "task_id": 9999,
        "department": "sales",
        "title": "Тест аналитики продаж",
        "description": "Нужно понять почему нет продаж. Работайте вместе с другими отделами.",
        "chat_id": -5095038892  # From the logs
    }, "stepan_bot")
    print("Done")

if __name__ == "__main__":
    asyncio.run(test_delegate())

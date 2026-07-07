import asyncio
from shared.event_bus import EventBus

async def test():
    eb = EventBus()
    await eb.connect()
    await eb.publish('TASK_COMPLETED', {'task_id': 11, 'completed_by': 'content', 'chat_id': -5095038892}, 'test')
    print("Published TASK_COMPLETED")

if __name__ == "__main__":
    asyncio.run(test())

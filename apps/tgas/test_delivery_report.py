import asyncio
import logging
from shared.event_bus import event_bus

logging.basicConfig(level=logging.INFO)

async def run_test() -> None:
    await event_bus.connect()
    
    mock_data = {
        "orders_by_status": [
            {"status": "new", "count": 5, "emoji": "🆕"},
            {"status": "preparing", "count": 2, "emoji": "🔧"},
            {"status": "delivering", "count": 3, "emoji": "🚚"}
        ],
        "stuck_deliveries": 1
    }
    
    print("Publishing DELIVERY_STATUS_REPORT to event_bus...")
    await event_bus.publish("DELIVERY_STATUS_REPORT", mock_data, "test_script")
    print("Event published! Check stepan_bot console output to see if it catches it.")
    
    await asyncio.sleep(1)
    await event_bus.stop()

if __name__ == "__main__":
    asyncio.run(run_test())

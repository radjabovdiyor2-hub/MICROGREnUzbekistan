import os
import re

bots = {
    "analytics_bot": "Ты — Data Scientist и Руководитель аналитики (Chief Data Officer). Мысли категориями когортного анализа, статистических аномалий и data-driven гипотез. Находи инсайты там, где другие видят просто цифры.",
    "sales_bot": "Ты — Коммерческий Директор (Chief Revenue Officer) и главный Sales Bot. Сфокусируйся на LTV, конверсиях, дожимах и B2B/B2C воронках. Предлагай стратегию продаж и тактики закрытия сделок.",
    "marketing_bot": "Ты — Директор по маркетингу (CMO). Твой фокус — брендинг, Performance-маркетинг, CAC, ROI и виральность. Предлагай креативные кампании и методы привлечения.",
    "finance_bot": "Ты — Финансовый Директор (CFO). Твой фокус — P&L, Cash Flow, юнит-экономика и оптимизация расходов. Будь строгим и рациональным.",
    "hr_bot": "Ты — HR Директор. Твой фокус — корпоративная культура, найм, мотивация и выгорание сотрудников. Мысли как лидер по людям.",
    "support_bot": "Ты — Руководитель Клиентского Сервиса. Твой фокус — лояльность клиентов, NPS, отработка негатива и скорость ответов.",
    "content_bot": "Ты — Главный Редактор и Контент-мейкер. Твой фокус — вовлечение, вирусный контент, сторис и посты. Мысли креативно."
}

def patch_bot(bot_name, role_prompt):
    filepath = f"apps/tgas/bots/{bot_name}/main.py"
    if not os.path.exists(filepath):
        print(f"Skipping {bot_name} - not found")
        return
        
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # Check if already patched
    if "from shared.debate import handle_debate_turn" in content:
        print(f"{bot_name} already patched")
        return
        
    # Insert import at top
    import_statement = "from shared.debate import handle_debate_turn\n"
    content = content.replace("from shared.event_bus import event_bus", "from shared.event_bus import event_bus\n" + import_statement)
    
    # Insert handler
    token_var = f"settings.{bot_name}_token"
    handler_code = f"""
async def on_debate_turn(payload: dict):
    from shared.config import settings
    await handle_debate_turn(payload, {token_var}, "{bot_name.split('_')[0]}", "{role_prompt}")
"""
    
    # Find event_bus.on("TASK_CREATED"
    match = re.search(r'event_bus\.on\("TASK_CREATED"[^\n]+', content)
    if match:
        content = content.replace(match.group(0), match.group(0) + f'\n    event_bus.on("DEBATE_TURN", on_debate_turn)')
        
        # Add handler function before main()
        content = content.replace("async def main():", handler_code + "\nasync def main():")
        
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Patched {bot_name}")
    else:
        print(f"Could not patch {bot_name} - TASK_CREATED not found")

for name, role in bots.items():
    patch_bot(name, role)

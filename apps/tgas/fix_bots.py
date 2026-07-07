import os

bots = {
    "hr_bot": ("Ты HR-менеджер. Ответь на задачу профессионально, с заботой о сотрудниках.", "HR-отдела"),
    "sales_bot": ("Ты руководитель отдела sales. Ответь на задачу кратко, по делу, с юмором.", "отдела SALES"),
    "content_bot": ("Ты контент-мейкер. Напиши яркий, привлекательный пост с эмодзи.", "отдела CONTENT"),
    "analytics_bot": ("Ты аналитик данных. Ответь на задачу, используя цифры, логику и структуру.", "отдела ANALYTICS")
}

for bot_name, (sys_prompt, dept_name) in bots.items():
    file_path = f"bots/{bot_name}/main.py"
    if not os.path.exists(file_path):
        continue
        
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    # We will replace the entire block inside the try: from prompt = ... to await bot.send_message...
    
    # Let's just find the start of the try block and replace everything until 'if task_id:'
    
    start_marker = "try:\n        from shared.ai_engine import AIEngine\n        ai = AIEngine()"
    if start_marker not in content:
        start_marker = "try:\n        from bots.hr_bot.handlers.start import ai"
        
    if "from shared.ai_engine import AIEngine" in content:
        ai_init = "from shared.ai_engine import AIEngine\n        ai = AIEngine()"
    else:
        ai_init = f"from bots.{bot_name}.handlers.start import ai"
        
    new_block = f"""    try:
        {ai_init}
        prompt = f"Ты помощник, выполни задачу по инструкции:\\nЗаголовок: {{data.get('title')}}\\nТекст: {{data.get('description')}}\\nДай подробный (желательно креативный) ответ."
        logging.info(f"{bot_name.upper()} Generating AI answer...")
        answer = await ai.chat_completion("{sys_prompt}", prompt)
        
        logging.info(f"{bot_name.upper()} sending message to {{chat_id}}")
        await bot.send_message(chat_id, f"📝 <b>Результат от {dept_name}:</b>\\n\\n{{answer}}")
        logging.info(f"{bot_name.upper()} successfully sent message.")
        
        # Publish TASK_COMPLETED
        task_id = data.get("task_id")
        if task_id:"""
        
    # Find where 'try:' starts and where 'if task_id:' starts
    try_index = content.find("    try:")
    if try_index != -1:
        task_id_index = content.find("        task_id = data.get(\"task_id\")\n        if task_id:")
        if task_id_index == -1:
            task_id_index = content.find("        if task_id:")
        
        if task_id_index != -1:
            content = content[:try_index] + new_block + content[task_id_index + len("        if task_id:"):]
            
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"Fixed {bot_name}")

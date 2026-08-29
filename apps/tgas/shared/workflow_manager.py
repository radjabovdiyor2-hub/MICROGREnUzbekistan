import logging
from typing import Dict, Any
from shared.event_bus import event_bus
from shared.task_ui import send_hitl_approval_request

logger = logging.getLogger(__name__)

class WorkflowManager:
    """Оркестратор процессов (DAG Workflow Manager). Следит за выполнением задач и передает их дальше по графу."""
    
    def __init__(self):
        self.workflows = {
            "new_product_launch": {
                "step_1": {"bot": "rnd_bot", "next": "hitl_approval"},
                "hitl_approval": {"bot": "admin", "next": "marketing_campaign"},
                "marketing_campaign": {"bot": "marketing_bot", "next": "done"}
            }
        }
    
    async def start(self):
        """Подписка на шину событий."""
        await event_bus.on("TASK_COMPLETED", self.on_task_completed)
        logger.info("WorkflowManager started listening to TASK_COMPLETED")

    async def start_workflow(self, workflow_name: str, initial_data: Dict[str, Any]):
        """Запуск нового графа задач."""
        if workflow_name not in self.workflows:
            logger.error(f"Unknown workflow: {workflow_name}")
            return
        
        first_step = "step_1"
        await self._dispatch_step(workflow_name, first_step, initial_data)

    async def on_task_completed(self, payload: Dict[str, Any]):
        """Обработчик завершения узла графа."""
        data = payload.get("data", {})
        workflow_name = data.get("workflow_name")
        current_step = data.get("current_step")
        
        if not workflow_name or not current_step:
            return # Обычная задача, не часть DAG
            
        workflow = self.workflows.get(workflow_name)
        if not workflow:
            return
            
        step_config = workflow.get(current_step)
        if not step_config:
            return
            
        next_step = step_config.get("next")
        if next_step and next_step != "done":
            await self._dispatch_step(workflow_name, next_step, data)
        elif next_step == "done":
            logger.info(f"Workflow {workflow_name} completed successfully.")

    async def _dispatch_step(self, workflow_name: str, step_name: str, context: Dict[str, Any]):
        """Отправка задачи нужному агенту или на HITL апрув."""
        workflow = self.workflows.get(workflow_name)
        step_config = workflow.get(step_name)
        target_bot = step_config.get("bot")
        
        task_data = {
            "workflow_name": workflow_name,
            "current_step": step_name,
            **context
        }
        
        if target_bot == "admin":
            # Human in the loop - ждем подтверждения
            await send_hitl_approval_request(
                workflow_name=workflow_name,
                step_name=step_name,
                context=context
            )
        else:
            # Отправка задачи боту через шину (BotBus/EventBus)
            from shared.bot_bus import send_task
            logger.info(f"Workflow {workflow_name}: dispatching {step_name} to {target_bot}")
            await send_task(
                from_bot="workflow_manager",
                to_bot=target_bot,
                task_type=f"workflow_{workflow_name}_{step_name}",
                payload=task_data
            )

workflow_manager = WorkflowManager()

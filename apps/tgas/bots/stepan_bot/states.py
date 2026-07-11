"""Степан (Менеджер) — FSM States"""
from aiogram.fsm.state import State, StatesGroup
class TaskStates(StatesGroup):
    entering_title = State()
    choosing_priority = State()
    entering_description = State()
    confirming = State()
class StandupStates(StatesGroup):
    entering_yesterday = State()
    entering_today = State()
    entering_blockers = State()

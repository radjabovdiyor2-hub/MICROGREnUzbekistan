"""Support Bot — States"""
from aiogram.fsm.state import State, StatesGroup
class ComplaintStates(StatesGroup):
    entering_text = State()
    confirming = State()

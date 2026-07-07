from aiogram.fsm.state import State, StatesGroup
class ApplicationStates(StatesGroup):
    entering_name = State()
    entering_phone = State()
    entering_position = State()
    confirming = State()
class LeaveStates(StatesGroup):
    entering_type = State()
    entering_start_date = State()
    entering_end_date = State()
    entering_reason = State()

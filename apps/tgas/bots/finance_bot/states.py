from aiogram.fsm.state import State, StatesGroup
class ExpenseStates(StatesGroup):
    entering_amount = State()
    entering_category = State()
    entering_description = State()
class IncomeStates(StatesGroup):
    entering_amount = State()
    entering_category = State()
    entering_description = State()

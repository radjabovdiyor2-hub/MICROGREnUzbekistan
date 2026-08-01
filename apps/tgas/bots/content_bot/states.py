from aiogram.fsm.state import State, StatesGroup


class ContentStates(StatesGroup):
    choosing_type = State()
    entering_topic = State()
    generating = State()

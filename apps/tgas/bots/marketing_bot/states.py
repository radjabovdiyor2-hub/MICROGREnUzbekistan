"""Marketing Bot — States"""

from aiogram.fsm.state import State, StatesGroup


class CampaignStates(StatesGroup):
    choosing_segment = State()
    entering_message = State()
    confirming = State()


class PromoStates(StatesGroup):
    choosing_product = State()
    entering_discount = State()
    confirming = State()

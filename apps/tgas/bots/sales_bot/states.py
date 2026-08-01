"""Sales Bot — FSM-состояния"""

from aiogram.fsm.state import State, StatesGroup


class OrderStates(StatesGroup):
    choosing_category = State()
    choosing_product = State()
    entering_quantity = State()
    confirming_cart = State()
    entering_address = State()
    entering_delivery_time = State()
    entering_notes = State()
    confirming_order = State()


class B2BStates(StatesGroup):
    entering_company = State()
    entering_company_type = State()
    entering_volume = State()
    entering_contact = State()
    confirming_b2b = State()


class FeedbackStates(StatesGroup):
    entering_feedback = State()

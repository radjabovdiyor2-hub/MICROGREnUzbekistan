"""Sales Bot — FSM-состояния"""

from aiogram.fsm.state import State, StatesGroup


# OrderStates убраны вместе с клиентской витриной: каталог, корзина и чекаут
# живут в витринном боте (apps/bot), и магазин у покупателя один.


class B2BStates(StatesGroup):
    entering_company = State()
    entering_company_type = State()
    entering_volume = State()
    entering_contact = State()
    confirming_b2b = State()


class FeedbackStates(StatesGroup):
    entering_feedback = State()

"""Тексты бонусной программы — в одном месте и всегда из настроек.

Раньше суммы жили литералами сразу в четырёх обработчиках и разошлись:
бот обещал 500 баллов за друга, а `/api/referral` начислял 5000; экран
бонусов обещал «100 баллов = 1 000 сум», хотя корзина списывает балл за сум.
Одинаковый текст в четырёх файлах невозможно править согласованно — поэтому
он собирается здесь, из `SiteConfig`.

Курс балла к суму равен единице: так списывает `apps/web/.../cart/page.tsx`
(`Math.min(bonusBalance, subtotal)`). Это не настройка, а свойство витрины —
вводить для него ключ значило бы завести настройку, которую никто не читает.
"""

from services.config_service import SiteConfig


def money(amount: int) -> str:
    """12345 → `12 345`."""
    return f"{amount:,}".replace(",", " ")


def balance_text(config: SiteConfig, bonuses: int) -> str:
    """Баланс баллов и что он даёт на оформлении."""
    lines = [
        "💰 <b>Ваши бонусы</b>\n",
        f"🎁 Баланс: <b>{money(bonuses)} баллов</b>",
        f"= {money(bonuses)} сум скидки\n",
        "<i>Как заработать:</i>",
        f"• 🛒 Заказы друзей по вашей ссылке — {config.bonus.referral_percent}% от суммы",
        f"• 👥 Приглашённый друг — {money(config.bonus.referrer_reward)} баллов",
        "• 🎮 Farm Simulator — играйте каждый день",
    ]
    if config.bonus.min_cashout > 0:
        lines.append(
            f"\n<i>Списать баллы можно, когда на балансе от "
            f"{money(config.bonus.min_cashout)}.</i>"
        )
    return "\n".join(lines)


def referral_text(config: SiteConfig, ref_link: str) -> str:
    """Приглашение друга. Суммы — те же, что начислит витрина."""
    return (
        "👥 <b>Пригласи друга — получи бонусы!</b>\n\n"
        f"🔗 Твоя ссылка:\n<code>{ref_link}</code>\n\n"
        "🎁 <b>Бонусы:</b>\n"
        f"• Ты получишь <b>{money(config.bonus.referrer_reward)} баллов</b> за каждого друга\n"
        f"• Друг получит <b>{money(config.bonus.new_user_reward)} баллов</b> при первом заказе\n"
        f"• И ещё {config.bonus.referral_percent}% с каждого его заказа\n\n"
        "📤 Поделитесь ссылкой с друзьями!"
    )

"""
Microgreen Uzbekistan — Instagram Analytics
=============================================
Модуль аналитики Instagram через Facebook Graph API.
Получение статистики профиля, метрик публикаций и топ-постов.
"""

import logging
import aiohttp
from shared.config import settings

logger = logging.getLogger(__name__)

API_VERSION = "v18.0"
GRAPH_BASE_URL = f"https://graph.facebook.com/{API_VERSION}"


async def get_profile_stats() -> dict:
    """
    Получает основную статистику Instagram-профиля.
    
    Uses: GET /{ig_account_id}?fields=followers_count,media_count,follows_count
    
    Returns:
        dict с ключами: followers_count, media_count, follows_count
        При ошибке возвращает пустой dict.
    """
    ig_account_id = getattr(settings, "instagram_account_id", "")
    access_token = getattr(settings, "instagram_access_token", "")
    
    if not ig_account_id or not access_token:
        logger.warning("Instagram Graph API не настроен. Невозможно получить статистику.")
        return {}
    
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/{ig_account_id}"
            params = {
                "fields": "followers_count,media_count,follows_count",
                "access_token": access_token,
            }
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                
                if "error" in data:
                    error = data["error"]
                    logger.error(
                        f"Ошибка получения статистики профиля: "
                        f"{error.get('message', data)}"
                    )
                    return {}
                
                stats = {
                    "followers_count": data.get("followers_count", 0),
                    "media_count": data.get("media_count", 0),
                    "follows_count": data.get("follows_count", 0),
                }
                logger.info(
                    f"📊 Статистика профиля: "
                    f"подписчики={stats['followers_count']}, "
                    f"посты={stats['media_count']}, "
                    f"подписки={stats['follows_count']}"
                )
                return stats
    except Exception as e:
        logger.error(f"Ошибка при получении статистики профиля: {e}", exc_info=True)
        return {}


async def get_media_insights(media_id: str, media_type: str = "") -> dict:
    """
    Метрики ОХВАТА поста через /insights: reach, saved, shares (лента/reels) или
    reach, replies (сторис) — то, что реально двигает распространение у алгоритма,
    а не только лайки/комменты. Возвращает dict (пусто при ошибке/недоступности).
    Требует business/creator аккаунт; story-insights живут ~24 часа.
    """
    access_token = getattr(settings, "instagram_access_token", "")
    if not media_id or not access_token:
        return {}
    mt = (media_type or "").upper()
    if mt == "STORY":
        metrics = "reach,replies"
    elif mt in ("VIDEO", "REELS"):
        metrics = "reach,saved,shares,views"  # 'plays' устарел → 'views'
    else:  # IMAGE / CAROUSEL_ALBUM / feed
        metrics = "reach,saved,shares"
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/{media_id}/insights"
            params = {"metric": metrics, "access_token": access_token}
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                if "error" in data:
                    logger.debug(f"insights /{media_id}: {data['error'].get('message', '')}")
                    return {}
                out = {}
                for item in data.get("data", []):
                    vals = item.get("values") or [{}]
                    out[item.get("name")] = vals[0].get("value", 0)
                return out
    except Exception as e:
        logger.debug(f"insights error {media_id}: {e}")
        return {}


async def get_recent_media_stats(limit: int = 10, with_insights: bool = False) -> list:
    """
    Получает статистику последних публикаций Instagram.

    Uses: GET /{ig_account_id}/media?fields=id,caption,timestamp,like_count,comments_count,media_type
    with_insights=True дополнительно тянет reach/saved/shares по каждому посту (+N запросов)
    и считает взвешенный score (сохранения и репосты весят больше — они двигают охват).

    Args:
        limit: Максимальное количество публикаций (по умолчанию 10)

    Returns:
        Список словарей с данными каждой публикации:
        - id, caption, timestamp, like_count, comments_count, media_type, engagement, score
          (+ reach, saved, shares при with_insights)
    """
    ig_account_id = getattr(settings, "instagram_account_id", "")
    access_token = getattr(settings, "instagram_access_token", "")
    
    if not ig_account_id or not access_token:
        logger.warning("Instagram Graph API не настроен. Невозможно получить медиа.")
        return []
    
    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/{ig_account_id}/media"
            params = {
                "fields": "id,caption,timestamp,like_count,comments_count,media_type",
                "limit": str(limit),
                "access_token": access_token,
            }
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                
                if "error" in data:
                    error = data["error"]
                    logger.error(
                        f"Ошибка получения медиа: {error.get('message', data)}"
                    )
                    return []
                
                media_list = data.get("data", [])
                
                # Добавляем engagement / score к каждому посту
                result = []
                for media in media_list:
                    likes = media.get("like_count", 0)
                    comments = media.get("comments_count", 0)
                    engagement = likes + comments

                    row = {
                        "id": media.get("id", ""),
                        "caption": media.get("caption", "")[:200] if media.get("caption") else "",
                        "timestamp": media.get("timestamp", ""),
                        "like_count": likes,
                        "comments_count": comments,
                        "media_type": media.get("media_type", ""),
                        "engagement": engagement,
                        "score": engagement,
                    }
                    if with_insights:
                        ins = await get_media_insights(row["id"], row["media_type"])
                        row["reach"] = ins.get("reach", 0)
                        row["saved"] = ins.get("saved", 0)
                        row["shares"] = ins.get("shares", 0)
                        # сохранения ×2, репосты ×3 — они сильнее двигают охват, чем лайки
                        row["score"] = engagement + 2 * row["saved"] + 3 * row["shares"]
                    result.append(row)

                logger.info(f"📊 Получено {len(result)} публикаций из Instagram"
                            f"{' (+insights)' if with_insights else ''}.")
                return result
    except Exception as e:
        logger.error(f"Ошибка при получении медиа: {e}", exc_info=True)
        return []


async def _fetch_media(edge: str, fields: str, limit: int) -> list:
    """Общий запрос к Graph API за медиа (edge = 'media' или 'stories')."""
    ig_account_id = getattr(settings, "instagram_account_id", "")
    access_token = getattr(settings, "instagram_access_token", "")

    if not ig_account_id or not access_token:
        logger.warning("Instagram Graph API не настроен — медиа недоступно.")
        return []

    try:
        async with aiohttp.ClientSession() as session:
            url = f"{GRAPH_BASE_URL}/{ig_account_id}/{edge}"
            params = {
                "fields": fields,
                "limit": str(limit),
                "access_token": access_token,
            }
            async with session.get(url, params=params) as resp:
                data = await resp.json()
                if "error" in data:
                    logger.error(
                        f"Ошибка получения /{edge}: "
                        f"{data['error'].get('message', data)}"
                    )
                    return []
                return data.get("data", [])
    except Exception as e:
        logger.error(f"Ошибка при запросе /{edge}: {e}", exc_info=True)
        return []


async def get_recent_media(limit: int = 5) -> list:
    """
    Последние публикации ЛЕНТЫ вместе со ссылкой на само медиа.

    В отличие от get_recent_media_stats (только метрики), здесь есть media_url
    и permalink — то, что нужно, чтобы РЕАЛЬНО показать пост руководителю.
    """
    media = await _fetch_media(
        "media",
        "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp",
        limit,
    )
    return [
        {
            "id": m.get("id", ""),
            "caption": m.get("caption") or "",
            "media_type": m.get("media_type", ""),
            # у видео media_url — это видеофайл; для превью есть thumbnail_url
            "media_url": m.get("media_url") or m.get("thumbnail_url") or "",
            "permalink": m.get("permalink", ""),
            "timestamp": m.get("timestamp", ""),
            "source": "feed",
        }
        for m in media
    ]


async def get_recent_stories(limit: int = 10) -> list:
    """
    Активные Stories (живут 24 часа) — именно ими публикуются утренний сторис
    и рецепт дня, поэтому в /media их НЕТ, только в /stories.
    """
    media = await _fetch_media(
        "stories",
        "id,media_type,media_url,permalink,timestamp",
        limit,
    )
    return [
        {
            "id": m.get("id", ""),
            "caption": "",  # у сторис нет caption в Graph API
            "media_type": m.get("media_type", ""),
            "media_url": m.get("media_url", ""),
            "permalink": m.get("permalink", ""),
            "timestamp": m.get("timestamp", ""),
            "source": "story",
        }
        for m in media
    ]


async def get_top_posts(limit: int = 5) -> list:
    """
    Возвращает топ-посты по уровню вовлечённости (engagement).
    
    Engagement = like_count + comments_count
    
    Args:
        limit: Количество топ-постов для возврата (по умолчанию 5)
        
    Returns:
        Список словарей с данными топ-постов, отсортированных по engagement (desc)
    """
    # Получаем меньше постов, но с insights (охват/сохранения/репосты) — это дороже по API,
    # поэтому берём умеренную выборку для ранжирования по реальному распространению.
    fetch_limit = max(limit * 3, 15)
    all_media = await get_recent_media_stats(limit=fetch_limit, with_insights=True)

    if not all_media:
        logger.info("Нет данных для определения топ-постов.")
        return []

    # Сортируем по взвешенному score (лайки+комменты + сохранения×2 + репосты×3)
    sorted_media = sorted(all_media, key=lambda x: x.get("score", x["engagement"]), reverse=True)
    top = sorted_media[:limit]

    if top:
        b = top[0]
        logger.info(
            f"🏆 Топ-{len(top)} постов: лучший score={b.get('score')} "
            f"(👍{b['like_count']} 💬{b['comments_count']} "
            f"🔖{b.get('saved', 0)} 🔁{b.get('shares', 0)} 👁{b.get('reach', 0)})"
        )

    return top


async def get_instagram_stats(top_limit: int = 5) -> dict:
    """
    Агрегированная статистика Instagram (профиль + топ-посты + сводка).

    Используется Analytics-ботом (bus_get_instagram_stats) и R&D для
    рекомендаций по контенту. Возвращает единый dict; при недоступности
    Graph API — пустые значения, но без исключения.
    """
    profile = await get_profile_stats()
    top_posts = await get_top_posts(limit=top_limit)

    followers = profile.get("followers_count", 0)
    media_count = profile.get("media_count", 0)

    lines = [
        f"👥 Подписчиков: {followers}",
        f"🖼 Публикаций: {media_count}",
    ]
    if top_posts:
        # суммарный охват/сохранения/репосты по топ-постам — то, что раньше не измерялось
        tot_reach = sum(p.get("reach", 0) for p in top_posts)
        tot_saved = sum(p.get("saved", 0) for p in top_posts)
        tot_shares = sum(p.get("shares", 0) for p in top_posts)
        lines.append(f"👁 Охват (топ): {tot_reach} · 🔖 Сохранения: {tot_saved} · 🔁 Репосты: {tot_shares}")
        lines.append("🏆 Топ-посты по распространению (score):")
        for i, p in enumerate(top_posts, 1):
            cap = (p.get("caption") or "").replace("\n", " ")[:50]
            lines.append(
                f"  {i}. 👁{p.get('reach', 0)} 🔖{p.get('saved', 0)} 🔁{p.get('shares', 0)} "
                f"👍{p['like_count']} 💬{p['comments_count']} — {cap}"
            )
    else:
        lines.append("Данные по постам недоступны (проверьте токен/доступ Graph API).")

    return {
        "profile": profile,
        "top_posts": top_posts,
        "summary": "\n".join(lines),
        "configured": bool(profile) or bool(top_posts),
    }


def _reach_verdict(avg_reach_pct: float) -> str:
    """Вердикт по здоровью аудитории на основе среднего охвата % (reach / followers)."""
    if avg_reach_pct <= 0:
        return "⚪️ нет данных охвата"
    if avg_reach_pct < 10:
        return ("🔴 аудитория холодная/накрученная — охват <10% почти всегда значит, "
                "что подписчики в основном неактивны. Контент это не чинит: чистить ботов "
                "и растить живых (Reels, коллаборации, локальный контент).")
    if avg_reach_pct < 25:
        return "🟡 средне — есть куда расти. Усиливай хук, сохранения/репосты, Reels."
    if avg_reach_pct < 50:
        return "🟢 здорово — аудитория живая и реагирует."
    return "🟢🔥 отлично — охват выше половины базы, контент раздаётся широко."


async def build_reach_report(post_limit: int = 8, story_limit: int = 8) -> dict:
    """
    Еженедельный отчёт по ОХВАТУ: считает reach% (охват/подписчики) по последним
    постам ленты и активным сторис — главный индикатор здоровья аудитории.
    Возвращает dict с готовым текстом ('summary') для отправки в Telegram.
    """
    profile = await get_profile_stats()
    followers = profile.get("followers_count", 0) or 0

    posts = await get_recent_media_stats(limit=post_limit, with_insights=True)
    stories = await get_recent_stories(limit=story_limit)

    # Охват сторис живёт ~24ч и есть только в /stories — тянем insights по каждой
    story_reaches = []
    for s in stories:
        ins = await get_media_insights(s.get("id", ""), "STORY")
        r = ins.get("reach", 0)
        if r:
            story_reaches.append(r)

    def _pct(v: int) -> float:
        return round(100 * v / followers, 1) if followers else 0.0

    post_reaches = [p.get("reach", 0) for p in posts if p.get("reach", 0)]
    avg_post_reach = round(sum(post_reaches) / len(post_reaches)) if post_reaches else 0
    avg_story_reach = round(sum(story_reaches) / len(story_reaches)) if story_reaches else 0
    avg_post_pct = _pct(avg_post_reach)
    avg_story_pct = _pct(avg_story_reach)
    tot_saved = sum(p.get("saved", 0) for p in posts)
    tot_shares = sum(p.get("shares", 0) for p in posts)

    # Вердикт по лучшему из двух каналов (что реально доходит до людей)
    verdict = _reach_verdict(max(avg_post_pct, avg_story_pct))

    lines = [
        "📊 <b>Еженедельный отчёт по охвату</b>",
        f"👥 Подписчиков: <b>{followers}</b>",
        f"🖼 Посты (ср.): охват <b>{avg_post_reach}</b> = <b>{avg_post_pct}%</b> базы  (по {len(post_reaches)} постам)",
        f"⭕️ Сторис (ср.): охват <b>{avg_story_reach}</b> = <b>{avg_story_pct}%</b> базы  (по {len(story_reaches)} сторис)",
        f"🔖 Сохранения: {tot_saved} · 🔁 Репосты: {tot_shares} (за период)",
        "",
        f"Вердикт: {verdict}",
    ]

    # Топ-3 поста периода по распространению (сохранения/репосты весят больше)
    if posts:
        top = sorted(posts, key=lambda x: x.get("score", x.get("engagement", 0)), reverse=True)[:3]
        lines.append("\n🏆 Лучшее за период:")
        for i, p in enumerate(top, 1):
            cap = (p.get("caption") or "").replace("\n", " ")[:45]
            lines.append(
                f"  {i}. 👁{p.get('reach', 0)} ({_pct(p.get('reach', 0))}%) "
                f"🔖{p.get('saved', 0)} 🔁{p.get('shares', 0)} — {cap}"
            )

    return {
        "followers": followers,
        "avg_post_reach": avg_post_reach,
        "avg_post_pct": avg_post_pct,
        "avg_story_reach": avg_story_reach,
        "avg_story_pct": avg_story_pct,
        "saved": tot_saved,
        "shares": tot_shares,
        "verdict": verdict,
        "summary": "\n".join(lines),
        "configured": bool(profile),
    }


async def sync_publication_metrics() -> None:
    """Синхронизирует данные охвата из Instagram Graph API обратно в content_publications."""
    try:
        from shared.database import get_session_ctx
        from sqlalchemy import text as sqt

        async with get_session_ctx() as session:
            res = await session.execute(sqt(
                "SELECT id, media_id, date, slot FROM content_publications "
                "WHERE media_id IS NOT NULL AND reach IS NULL"
            ))
            rows = res.fetchall()
            if not rows:
                return

            updated = 0
            for row in rows:
                pub_id, media_id, day, slot = row[0], row[1], row[2], row[3]
                insights = await get_media_insights(media_id)
                if insights and "error" not in insights:
                    await session.execute(sqt(
                        "UPDATE content_publications SET "
                        "reach = :reach, likes = :likes, comments = :comments "
                        "WHERE id = :pid"
                    ), {
                        "reach": insights.get("reach", 0),
                        "likes": insights.get("engagement", 0),
                        "comments": insights.get("saved", 0),
                        "pid": pub_id,
                    })
                    updated += 1

            if updated:
                logging.info(f"sync_publication_metrics: обновлены показатели по {updated} публикациям")
                # Замыкаем петлю: Измерение -> Вывод -> Изменение поведения
                try:
                    from shared.feedback_loop import feedback_loop
                    metrics_res = await session.execute(sqt(
                        "SELECT slot, AVG(reach) as avg_reach, AVG(likes) as avg_likes "
                        "FROM content_publications WHERE reach IS NOT NULL "
                        "GROUP BY slot"
                    ))
                    slot_stats = {r[0]: {"avg_reach": float(r[1] or 0), "avg_likes": float(r[2] or 0)} for r in metrics_res.fetchall()}
                    
                    await feedback_loop.evaluate_and_adapt(
                        bot="content_bot",
                        metric="engagement_rate",
                        current_data=slot_stats,
                        benchmark_data={"target_reach_per_post": 500, "target_engagement_rate": 0.05}
                    )
                except Exception as fe:
                    logging.warning(f"Feedback loop trigger warning in content_bot: {fe}")
    except Exception as e:
        logger.error(f"sync_publication_metrics error: {e}", exc_info=True)

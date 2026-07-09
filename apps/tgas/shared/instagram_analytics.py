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


async def get_recent_media_stats(limit: int = 10) -> list:
    """
    Получает статистику последних публикаций Instagram.
    
    Uses: GET /{ig_account_id}/media?fields=id,caption,timestamp,like_count,comments_count,media_type
    
    Args:
        limit: Максимальное количество публикаций (по умолчанию 10)
        
    Returns:
        Список словарей с данными каждой публикации:
        - id, caption, timestamp, like_count, comments_count, media_type, engagement
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
                
                # Добавляем engagement score к каждому посту
                result = []
                for media in media_list:
                    likes = media.get("like_count", 0)
                    comments = media.get("comments_count", 0)
                    engagement = likes + comments
                    
                    result.append({
                        "id": media.get("id", ""),
                        "caption": media.get("caption", "")[:200] if media.get("caption") else "",
                        "timestamp": media.get("timestamp", ""),
                        "like_count": likes,
                        "comments_count": comments,
                        "media_type": media.get("media_type", ""),
                        "engagement": engagement,
                    })
                
                logger.info(f"📊 Получено {len(result)} публикаций из Instagram.")
                return result
    except Exception as e:
        logger.error(f"Ошибка при получении медиа: {e}", exc_info=True)
        return []


async def get_top_posts(limit: int = 5) -> list:
    """
    Возвращает топ-посты по уровню вовлечённости (engagement).
    
    Engagement = like_count + comments_count
    
    Args:
        limit: Количество топ-постов для возврата (по умолчанию 5)
        
    Returns:
        Список словарей с данными топ-постов, отсортированных по engagement (desc)
    """
    # Получаем больше постов, чтобы выбрать лучшие
    fetch_limit = max(limit * 4, 25)
    all_media = await get_recent_media_stats(limit=fetch_limit)
    
    if not all_media:
        logger.info("Нет данных для определения топ-постов.")
        return []
    
    # Сортируем по engagement (лайки + комментарии) и берём топ
    sorted_media = sorted(all_media, key=lambda x: x["engagement"], reverse=True)
    top = sorted_media[:limit]
    
    if top:
        logger.info(
            f"🏆 Топ-{len(top)} постов: "
            f"лучший engagement = {top[0]['engagement']} "
            f"(👍 {top[0]['like_count']} + 💬 {top[0]['comments_count']})"
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
        lines.append("🏆 Топ-посты по вовлечённости:")
        for i, p in enumerate(top_posts, 1):
            cap = (p.get("caption") or "").replace("\n", " ")[:60]
            lines.append(
                f"  {i}. 👍 {p['like_count']} 💬 {p['comments_count']} "
                f"(engagement {p['engagement']}) — {cap}"
            )
    else:
        lines.append("Данные по постам недоступны (проверьте токен/доступ Graph API).")

    return {
        "profile": profile,
        "top_posts": top_posts,
        "summary": "\n".join(lines),
        "configured": bool(profile) or bool(top_posts),
    }

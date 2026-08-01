import logging
from sqlalchemy import text as sqt
from shared.database import get_session_ctx
from shared.instagram_analytics.media import get_media_insights

logger = logging.getLogger(__name__)

async def sync_publication_metrics() -> None:
    try:
        async with get_session_ctx() as session:
            res = await session.execute(
                sqt(
                    "SELECT id, media_id, date, slot FROM content_publications "
                    "WHERE media_id IS NOT NULL AND reach IS NULL"
                )
            )
            rows = res.fetchall()
            if not rows:
                return

            updated = 0
            for row in rows:
                pub_id, media_id, _day, _slot = row[0], row[1], row[2], row[3]
                insights = await get_media_insights(media_id)
                if insights and "error" not in insights:
                    await session.execute(
                        sqt(
                            "UPDATE content_publications SET "
                            "reach = :reach, likes = :likes, comments = :comments "
                            "WHERE id = :pid"
                        ),
                        {
                            "reach": insights.get("reach", 0),
                            "likes": insights.get("engagement", 0),
                            "comments": insights.get("saved", 0),
                            "pid": pub_id,
                        },
                    )
                    updated += 1

            if updated:
                logger.info(f"sync_publication_metrics: обновлены показатели по {updated} публикациям")
                try:
                    from shared.feedback_loop import feedback_loop
                    metrics_res = await session.execute(
                        sqt(
                            "SELECT slot, AVG(reach) as avg_reach, AVG(likes) as avg_likes "
                            "FROM content_publications WHERE reach IS NOT NULL "
                            "GROUP BY slot"
                        )
                    )
                    slot_stats = {
                        r[0]: {
                            "avg_reach": float(r[1] or 0),
                            "avg_likes": float(r[2] or 0),
                        }
                        for r in metrics_res.fetchall()
                    }

                    await feedback_loop.evaluate_and_adapt(
                        bot="content_bot",
                        metric="engagement_rate",
                        current_data=slot_stats,
                        benchmark_data={
                            "target_reach_per_post": 500,
                            "target_engagement_rate": 0.05,
                        },
                    )
                except Exception as fe:
                    logger.warning(f"Feedback loop trigger warning in content_bot: {fe}")
    except Exception as e:
        logger.error(f"sync_publication_metrics error: {e}", exc_info=True)

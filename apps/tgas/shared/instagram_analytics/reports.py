from shared.instagram_analytics.profile import get_profile_stats
from shared.instagram_analytics.media import get_top_posts, get_recent_media_stats, get_recent_stories, get_media_insights

async def get_instagram_stats(top_limit: int = 5) -> dict:
    profile = await get_profile_stats()
    top_posts = await get_top_posts(limit=top_limit)

    followers = profile.get("followers_count", 0)
    media_count = profile.get("media_count", 0)

    lines = [
        f"👥 Подписчиков: {followers}",
        f"🖼 Публикаций: {media_count}",
    ]
    if top_posts:
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
    if avg_reach_pct <= 0:
        return "⚪️ нет данных охвата"
    if avg_reach_pct < 10:
        return (
            "🔴 аудитория холодная/накрученная — охват <10% почти всегда значит, "
            "что подписчики в основном неактивны. Контент это не чинит: чистить ботов "
            "и растить живых (Reels, коллаборации, локальный контент)."
        )
    if avg_reach_pct < 25:
        return "🟡 средне — есть куда расти. Усиливай хук, сохранения/репосты, Reels."
    if avg_reach_pct < 50:
        return "🟢 здорово — аудитория живая и реагирует."
    return "🟢🔥 отлично — охват выше половины базы, контент раздаётся широко."

async def build_reach_report(post_limit: int = 8, story_limit: int = 8) -> dict:
    profile = await get_profile_stats()
    followers = profile.get("followers_count", 0) or 0

    posts = await get_recent_media_stats(limit=post_limit, with_insights=True)
    stories = await get_recent_stories(limit=story_limit)

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

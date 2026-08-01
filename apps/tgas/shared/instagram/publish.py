import os
import re
from shared.instagram.post import post_to_instagram
from shared.brand import render_story_text, BRAND

async def post_story_with_text(
    image_path: str,
    headline: str = "",
    caption: str = "",
    cta: str = "ПОДРОБНЕЕ →",
) -> bool:
    story_img = image_path
    if os.path.isfile(image_path):
        tags = " ".join(re.findall(r"#\w+", caption or "")) or BRAND["hashtag"]
        out = "temp_story.jpg"
        ok = render_story_text(
            image_path,
            out,
            headline=headline or "",
            hashtags=tags,
            mention=BRAND["instagram"],
            cta=cta,
        )
        if ok:
            story_img = out
    result = await post_to_instagram(story_img, "", post_type="story")
    return bool(result)

async def publish_daily_and_grid(
    image_path: str,
    caption: str,
    headline: str = "",
    to_grid: bool = False,
) -> dict:
    result = {"story": False, "grid": None}
    result["story"] = await post_story_with_text(image_path, headline, caption)
    if to_grid:
        result["grid"] = await post_to_instagram(image_path, caption, post_type="feed")
    return result

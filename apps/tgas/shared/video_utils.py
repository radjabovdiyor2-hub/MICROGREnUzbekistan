"""
video_utils — сборка коротких вертикальных видео (Reels) из готового кадра.

Reels — главный двигатель органического охвата в Instagram (попадают в
рекомендации не-подписчикам). Мы НЕ генерируем видео с нуля, а анимируем уже
отрендеренный сторис-кадр (текст/пункты уже впечатаны через brand.render_*)
эффектом Ken Burns (плавный zoom) — это дёшево и стабильно.

Реализация — прямой вызов ffmpeg (subprocess), без тяжёлого moviepy.
Требует бинарь ffmpeg (в Docker-образе — `apt-get install ffmpeg`).
Локально без ffmpeg make_reel вернёт None (не падает).
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from typing import Optional

logger = logging.getLogger(__name__)


def _ffmpeg_bin() -> Optional[str]:
    """Путь к ffmpeg: из env FFMPEG_BIN или из PATH."""
    return os.getenv("FFMPEG_BIN") or shutil.which("ffmpeg")


def ffmpeg_available() -> bool:
    return bool(_ffmpeg_bin())


def make_reel(
    image_path: str,
    out_path: str = "temp_reel.mp4",
    duration: float = 8.0,
    audio_path: Optional[str] = None,
    fps: int = 30,
) -> Optional[str]:
    """
    Собирает вертикальный Reel (1080×1920, H.264/AAC, MP4) из одного кадра
    эффектом Ken Burns (медленный zoom-in) через ffmpeg.

    image_path — готовый кадр (текст уже впечатан render_story_text/render_recipe_card);
    audio_path — опц. фоновый трек (если нет — добавляем тихую дорожку, её требует Reels API);
    возвращает путь к MP4 или None (ffmpeg недоступен / ошибка).

    Формат под требования IG Reels: 9:16, H.264 + yuv420p, AAC, длительность 3–90с.
    """
    ff = _ffmpeg_bin()
    if not ff:
        logger.warning(
            "make_reel: ffmpeg не найден (нет в PATH и FFMPEG_BIN). Reel не собран."
        )
        return None
    if not (image_path and os.path.isfile(image_path)):
        logger.warning("make_reel: нет исходного кадра %s", image_path)
        return None

    duration = max(3.0, min(float(duration), 90.0))
    frames = int(duration * fps)

    # Пред-масштаб вверх → у zoompan есть запас (иначе upscale внутри фильтра мылит),
    # затем медленный zoom-in по центру. setsar=1 — квадратный пиксель.
    vf = (
        f"scale=1350:2400:force_original_aspect_ratio=increase,crop=1350:2400,"
        f"zoompan=z='min(zoom+0.0010,1.15)':d={frames}:"
        f"x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps={fps},setsar=1[v]"
    )

    cmd = [ff, "-y", "-loop", "1", "-i", image_path]
    if audio_path and os.path.isfile(audio_path):
        cmd += ["-i", audio_path]
    else:
        cmd += [
            "-f",
            "lavfi",
            "-t",
            str(duration),
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=44100",
        ]
    cmd += [
        "-filter_complex",
        vf,
        "-map",
        "[v]",
        "-map",
        "1:a",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-r",
        str(fps),
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-t",
        str(duration),
        "-shortest",
        "-movflags",
        "+faststart",
        out_path,
    ]

    try:
        proc = subprocess.run(cmd, capture_output=True, timeout=180)
        if proc.returncode != 0:
            logger.error(
                "make_reel: ffmpeg rc=%s: %s",
                proc.returncode,
                proc.stderr.decode("utf-8", "ignore")[-600:],
            )
            return None
        if os.path.isfile(out_path) and os.path.getsize(out_path) > 0:
            logger.info("make_reel: собран %s (%.1fs)", out_path, duration)
            return out_path
        return None
    except subprocess.TimeoutExpired:
        logger.error("make_reel: ffmpeg таймаут")
        return None
    except Exception as e:  # noqa: BLE001
        logger.error("make_reel: ошибка ffmpeg: %s", e, exc_info=True)
        return None

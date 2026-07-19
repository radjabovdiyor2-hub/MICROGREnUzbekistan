import re
import os

src = r"d:\MICROGREnUzbekistan\apps\web\public\magazine\fresh_weekly_issue_01.html"
dst = r"d:\MICROGREnUzbekistan\apps\web\public\magazine\fresh_weekly_issue_02.html"

with open(src, "r", encoding="utf-8") as f:
    html = f.read()

# Replace texts
html = html.replace("Выпуск №1", "Выпуск №2")
html = html.replace("Выпуск 1", "Выпуск 2")
html = html.replace("Сладкое + Острое: новая эра вкуса", "Стрит-фуд, Пибимпаб и Азиатские тренды")
html = html.replace("Hot Honey", "Пибимпаб")
html = html.replace("Нон-кабоб", "Корейский стрит-фуд")
html = html.replace("Чизкейк", "Острые азиатские вкусы")
html = html.replace("ORA — Ресторан недели", "Дайкон и кинза в деле")
html = html.replace("21 июля 2026", "28 июля 2026")
html = html.replace("background:#0a1f0a", "background:#1a0a0a") # change theme to dark red
html = html.replace("color:#4ade80", "color:#fb923c") # change accent to orange
html = html.replace("rgba(22,163,74", "rgba(251,146,60")

with open(dst, "w", encoding="utf-8") as f:
    f.write(html)

print("Created fresh_weekly_issue_02.html")

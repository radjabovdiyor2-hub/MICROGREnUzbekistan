import sys
import re

filepath = 'apps/web/src/components/admin/AdminShifts.tsx'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('import { useState, useEffect }', 'import { useState }')
content = content.replace('const payload: any = {', 'const payload: Record<string, unknown> = {')

# The errors mentioned unescaped entities on lines 142, 206, 247
# Let's just fix any unescaped quotes inside JSX text.
# The easiest way is to escape them individually
content = content.replace("Qo'shish", "Qo&apos;shish")
content = content.replace("o'zgartirish", "o&apos;zgartirish")
content = content.replace("o'chirish", "o&apos;chirish")
content = content.replace("O'chirish", "O&apos;chirish")
content = content.replace("O'zgartirish", "O&apos;zgartirish")
content = content.replace("o'chirilsinmi", "o&apos;chirilsinmi")
content = content.replace("To'g'rilash", "To&apos;g&apos;rilash")

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

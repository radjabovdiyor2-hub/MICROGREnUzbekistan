import json
import os
import glob

brain_dir = r"C:\Users\TUF GAMING\.gemini\antigravity\brain"
target_dir = r"c:\Users\TUF GAMING\Desktop\tgas\bots"

recovered_files = {}

for transcript_path in glob.glob(
    os.path.join(brain_dir, "**", "transcript_full.jsonl"), recursive=True
):
    try:
        with open(transcript_path, "r", encoding="utf-8") as f:
            for line in f:
                if not line.strip():
                    continue
                data = json.loads(line)
                if "tool_calls" in data:
                    for tc in data["tool_calls"]:
                        if (
                            tc.get("function", {}).get("name")
                            == "default_api:write_to_file"
                        ):
                            args = tc["function"]["arguments"]
                            if isinstance(args, str):
                                try:
                                    args = json.loads(args)
                                except (json.JSONDecodeError, TypeError):
                                    continue

                            target_file = args.get("TargetFile", "")
                            content = args.get("CodeContent", "")
                            if (
                                target_file
                                and "bots" in target_file.lower()
                                and content
                            ):
                                # Normalize path for comparison
                                norm_path = os.path.normpath(target_file.lower())
                                recovered_files[norm_path] = content
    except Exception as e:
        print(f"Error reading {transcript_path}: {e}")

restored_count = 0
for root, _, files in os.walk(target_dir):
    for file in files:
        if file.endswith(".py"):
            p = os.path.join(root, file)
            if os.path.getsize(p) == 0:
                norm_p = os.path.normpath(p.lower())
                if norm_p in recovered_files:
                    with open(p, "w", encoding="utf-8") as f:
                        # Fix the specific uppercase issue that caused this mess while recovering
                        content = recovered_files[norm_p]
                        import re

                        content = re.sub(
                            r"settings\.([A-Z_]+)",
                            lambda m: "settings." + m.group(1).lower(),
                            content,
                        )
                        f.write(content)
                    restored_count += 1
                else:
                    # Maybe it was just an empty __init__.py
                    with open(p, "w", encoding="utf-8") as f:
                        f.write("# init\n")
                    restored_count += 1

print(f"Restored {restored_count} files!")

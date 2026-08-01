from pathlib import Path

API_VERSION = "v18.0"
GRAPH_BASE_URL = f"https://graph.facebook.com/{API_VERSION}"
ENV_PATH = str(Path(__file__).resolve().parent.parent.parent / ".env")

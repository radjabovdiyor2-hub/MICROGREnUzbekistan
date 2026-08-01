def _pick(seq: list, i: int) -> dict:
    return seq[i % len(seq)]

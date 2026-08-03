"""Инструменты отделов AI-офиса. Точка входа — shared.tools.registry."""

from shared.tools.registry import (
    CHIEF_ALIASES,
    CHIEF_DEPARTMENT,
    Tool,
    all_tools,
    by_name,
    call,
    catalog_text,
    departments_with_tools,
    normalize_result,
    register,
    schemas_for,
    tools_for,
)

__all__ = [
    "CHIEF_ALIASES",
    "CHIEF_DEPARTMENT",
    "Tool",
    "all_tools",
    "by_name",
    "call",
    "catalog_text",
    "departments_with_tools",
    "normalize_result",
    "register",
    "schemas_for",
    "tools_for",
]

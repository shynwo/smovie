"""Logs orientés grep (component=… event=… clé=valeur), sans dépendance JSON."""

from __future__ import annotations

import logging
from typing import Any


def structured(
    logger: logging.Logger,
    level: int,
    *,
    component: str,
    event: str,
    exc_info: bool = False,
    **fields: Any,
) -> None:
    parts = [f"component={component}", f"event={event}"]
    for key in sorted(fields):
        value = fields[key]
        if value is None:
            continue
        text = str(value).replace("\n", " ").replace("\r", "")[:800]
        parts.append(f"{key}={text}")
    logger.log(level, " ".join(parts), exc_info=exc_info)


def catalog_log() -> logging.Logger:
    return logging.getLogger("smovie.catalog")


def auth_log() -> logging.Logger:
    return logging.getLogger("smovie.auth")

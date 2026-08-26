#!/usr/bin/env python3
"""CLI reference for Demucs via Replicate (offline/dev).

Usage:
  set REPLICATE_API_TOKEN=...
  pip install replicate
  python scripts/demucs_replicate.py path/to/audio.mp3
"""

from __future__ import annotations

import json
import os
import sys


DEFAULT_VERSION = (
    "abf8fe28e407afa6d8e41e86a759caccc0af8e49c3c68016006b62cb0968441e"
)


def separate(audio_path: str) -> dict:
    import replicate

    token = os.environ.get("REPLICATE_API_TOKEN")
    if not token:
        raise SystemExit("REPLICATE_API_TOKEN is required")

    version = os.environ.get("REPLICATE_DEMUCS_VERSION", DEFAULT_VERSION)
    with open(audio_path, "rb") as audio:
        output = replicate.run(
            f"cjwbw/demucs:{version}",
            input={
                "audio": audio,
                "stem": "vocals",
                "model_name": "htdemucs",
            },
        )

    if isinstance(output, dict):
        vocals = output.get("vocals") or output.get("Vocals")
        backing = (
            output.get("no_vocals")
            or output.get("other")
            or output.get("accompaniment")
        )
    else:
        vocals = output[0] if output else None
        backing = output[1] if output and len(output) > 1 else None

    return {"vocals": vocals, "backing": backing, "raw": output}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: demucs_replicate.py <audio-file>", file=sys.stderr)
        raise SystemExit(2)
    result = separate(sys.argv[1])
    print(json.dumps({k: result[k] for k in ("vocals", "backing")}, indent=2))

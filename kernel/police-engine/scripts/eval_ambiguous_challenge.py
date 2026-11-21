#!/usr/bin/env python3
"""Checks that ambiguous challenge examples lead to abstention, not a binary verdict."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from detectors.grooming_xlm import GroomingDetector  # noqa: E402


def main() -> int:
    rows = [
        json.loads(line)
        for line in (ROOT / "data" / "grooming" / "challenge_ambiguous.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    detector = GroomingDetector()
    info = detector.load(prefer_cpu=True)
    if not info.loaded:
        print("FAIL load:", info.error)
        return 2

    failures = 0
    for row in rows:
        result = detector.analyze(row["text"])
        assessment = result.metadata.get("grooming_assessment", {})
        abstained = result.top_label is None
        failures += int(not abstained)
        print(
            f"{row['id']}\tlabel={row['label']}\ttop={result.top_label or 'ABSTAIN'}\t"
            f"risk_level={assessment.get('risk_level', 'n/a')}\t"
            f"review_priority={assessment.get('review_priority', 'n/a')}\t"
            f"{'PASS' if abstained else 'FAIL'}"
        )
    print(f"ambiguous_challenge_abstention={len(rows) - failures}/{len(rows)}")
    print("DISCLAIMER: This is a small synthetic challenge set, not accuracy validation.")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

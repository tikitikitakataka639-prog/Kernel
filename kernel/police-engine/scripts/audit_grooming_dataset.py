#!/usr/bin/env python3
"""Audit split integrity and schema for the synthetic Grooming corpus.

This script checks data hygiene only. It does not certify model quality or
validate synthetic data as representative of real conversations.
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "grooming"
SPLITS = ("train", "val", "test")
LABELS = {"benign", "grooming_risk"}
LANGUAGES = {"es", "en", "mixed"}
REQUIRED = {"id", "label", "language", "text", "license"}


def canonical_id(value: str) -> str:
    return re.sub(r"-var(?:-\d+)?$", "", value)


def normalized_hash(text: str) -> str:
    value = unicodedata.normalize("NFKC", text).casefold()
    value = " ".join(value.split())
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def read_jsonl(path: Path) -> list[dict]:
    rows = []
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise ValueError(f"{path.name}:{line_no}: JSON inválido: {exc}") from exc
    return rows


def main() -> int:
    errors: list[str] = []
    reports: dict[str, dict] = {}
    seen_group: dict[str, str] = {}
    seen_text: dict[str, str] = {}
    for split in SPLITS:
        path = DATA / f"{split}.jsonl"
        if not path.exists():
            errors.append(f"Falta {path.name}")
            continue
        rows = read_jsonl(path)
        labels = Counter()
        languages = Counter()
        difficulties = Counter()
        for index, row in enumerate(rows, 1):
            missing = REQUIRED - set(row)
            if missing:
                errors.append(f"{split}:{index}: faltan campos {sorted(missing)}")
            if row.get("label") not in LABELS:
                errors.append(f"{split}:{index}: etiqueta inválida {row.get('label')!r}")
            if row.get("language") not in LANGUAGES:
                errors.append(f"{split}:{index}: idioma inválido {row.get('language')!r}")
            if not str(row.get("text", "")).strip():
                errors.append(f"{split}:{index}: texto vacío")
            labels[row.get("label", "<missing>")] += 1
            languages[row.get("language", "<missing>")] += 1
            difficulties[row.get("difficulty", "unspecified")] += 1
            group = canonical_id(str(row.get("id", f"{split}-{index}")))
            if group in seen_group and seen_group[group] != split:
                errors.append(f"Fuga de grupo {group}: {seen_group[group]} y {split}")
            seen_group[group] = split
            digest = normalized_hash(str(row.get("text", "")))
            if digest in seen_text and seen_text[digest] != split:
                errors.append(f"Texto idéntico tras normalizar: {seen_text[digest]} y {split} (fila {index})")
            seen_text[digest] = split
        reports[split] = {
            "n": len(rows), "labels": dict(labels), "languages": dict(languages),
            "difficulties": dict(difficulties),
        }

    holdout_path = DATA / "independent_holdout.jsonl"
    holdout_report = {"n": 0, "disjoint_from_primary": True}
    if holdout_path.exists():
        holdout = read_jsonl(holdout_path)
        holdout_report["n"] = len(holdout)
        primary_hashes = set(seen_text)
        for index, row in enumerate(holdout, 1):
            digest = normalized_hash(str(row.get("text", "")))
            if digest in primary_hashes:
                errors.append(f"Holdout no independiente: texto duplicado en fila {index}")
                holdout_report["disjoint_from_primary"] = False

    challenge_path = DATA / "challenge_ambiguous.jsonl"
    challenge_report = {"n": 0, "excluded_from_training": True, "labels_valid": True}
    if challenge_path.exists():
        challenge = read_jsonl(challenge_path)
        challenge_report["n"] = len(challenge)
        for index, row in enumerate(challenge, 1):
            if row.get("label") != "review_required":
                errors.append(f"challenge_ambiguous:{index}: la etiqueta debe ser review_required")
                challenge_report["labels_valid"] = False
            digest = normalized_hash(str(row.get("text", "")))
            if digest in seen_text:
                errors.append(f"challenge_ambiguous:{index}: texto también presente en train/val/test")
                challenge_report["excluded_from_training"] = False

    report = {
        "dataset": "kernel-grooming-synthetic-v2",
        "split_integrity": "PASS" if not errors else "FAIL",
        "splits": reports,
        "independent_holdout": holdout_report,
        "ambiguous_challenge": challenge_report,
        "limitations": [
            "Auditoría estructural; no evalúa representatividad ni eficacia del detector.",
            "El corpus es sintético y no acredita rendimiento en conversaciones reales.",
        ],
        "errors": errors,
    }
    out_path = DATA / "audit_report.json"
    out_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())

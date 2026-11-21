#!/usr/bin/env python3
"""One-pass report for the reserved synthetic holdout.

Abstentions are counted separately instead of silently being treated as benign.
The holdout is synthetic and must not be described as real-world validation.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from detectors.grooming_xlm import GroomingDetector  # noqa: E402


def main() -> int:
    path = ROOT / "data" / "grooming" / "independent_holdout.jsonl"
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    detector = GroomingDetector()
    info = detector.load(prefer_cpu=True)
    if not info.loaded:
        print("FAIL load:", info.error)
        return 2

    y_true: list[str] = []
    y_pred: list[str] = []
    abstentions = 0
    by_language: dict[str, dict[str, int]] = defaultdict(lambda: {"n": 0, "covered": 0, "correct": 0, "abstained": 0})
    print("backend", detector._backend, "version", detector.version)
    for row in rows:
        result = detector.analyze(row["text"])
        assessment = result.metadata.get("grooming_assessment", {})
        prediction = result.top_label
        language = row["language"]
        by_language[language]["n"] += 1
        if prediction not in {"benign", "grooming_risk"}:
            abstentions += 1
            by_language[language]["abstained"] += 1
            status = "ABSTAIN"
        else:
            y_true.append(row["label"])
            y_pred.append(prediction)
            by_language[language]["covered"] += 1
            correct = prediction == row["label"]
            by_language[language]["correct"] += int(correct)
            status = "CORRECT" if correct else "WRONG"
        print(
            f"{row['id']}\ttrue={row['label']}\tpred={prediction or 'review_required'}\t"
            f"risk_level={assessment.get('risk_level', 'n/a')}\tlanguage={language}\t{status}"
        )

    covered = len(y_pred)
    correct_total = sum(1 for actual, predicted in zip(y_true, y_pred) if actual == predicted)
    report = {
        "n": len(rows),
        "covered": covered,
        "abstentions": abstentions,
        "coverage": covered / len(rows) if rows else 0.0,
        "selective_accuracy": correct_total / covered if covered else None,
        "by_language": {
            lang: {
                **stats,
                "coverage": stats["covered"] / stats["n"] if stats["n"] else 0.0,
                "selective_accuracy": stats["correct"] / stats["covered"] if stats["covered"] else None,
            }
            for lang, stats in sorted(by_language.items())
        },
        "disclaimer": "Synthetic holdout only; not validation on real conversations and not a legal finding.",
    }
    if covered:
        try:
            from sklearn.metrics import classification_report, confusion_matrix, precision_recall_fscore_support
            precision, recall, f1, _ = precision_recall_fscore_support(
                y_true, y_pred, labels=["benign", "grooming_risk"], average="binary", pos_label="grooming_risk", zero_division=0
            )
            report["selective_metrics"] = {
                "precision": float(precision), "recall": float(recall), "f1": float(f1),
                "confusion_matrix_labels": ["benign", "grooming_risk"],
                "confusion_matrix": confusion_matrix(y_true, y_pred, labels=["benign", "grooming_risk"]).tolist(),
                "classification_report": classification_report(y_true, y_pred, labels=["benign", "grooming_risk"], zero_division=0, output_dict=True),
            }
        except ImportError:
            pass
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

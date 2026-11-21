#!/usr/bin/env python3
"""
Entrenamiento EXPERIMENTAL reproducible (TF-IDF + LogisticRegression).

Motivo del backend sklearn en este entorno:
- XLM-RoBERTa-base (~1.1 GB fp32) no cabe de forma fiable en ~1.2 GB RAM del sandbox.
- Este checkpoint permite inferencia real ES/EN y métricas sobre el corpus sintético.
- El script train_grooming_xlm.py es la ruta prevista para hardware 16 GB + GPU.

Modelo id lógico: grooming-xlm-roberta-es-en (familia)
Backend de este artefacto: sklearn_tfidf_v1 → marcado EXPERIMENTAL.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)
from sklearn.pipeline import Pipeline

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "grooming"
OUT = ROOT / "models" / "grooming-xlm"
LABEL2ID = {"benign": 0, "grooming_risk": 1}
ID2LABEL = {0: "benign", 1: "grooming_risk"}


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            rows.append(json.loads(line))
    return rows


def xy(rows: list[dict]):
    texts = [r["text"] for r in rows]
    y = np.array([LABEL2ID[r["label"]] for r in rows], dtype=np.int64)
    langs = [r["language"] for r in rows]
    return texts, y, langs


def validate_split_integrity(splits: dict[str, list[dict]]) -> None:
    """Fail closed if a conversation root or exact text crosses data splits."""
    group_owner: dict[str, str] = {}
    text_owner: dict[str, str] = {}
    for split_name, rows in splits.items():
        for row in rows:
            canonical = re.sub(r"-var(?:-\d+)?$", "", str(row["id"]))
            previous = group_owner.setdefault(canonical, split_name)
            if previous != split_name:
                raise ValueError(f"Data leakage: conversation group {canonical} in {previous} and {split_name}")
            normalized = " ".join(str(row["text"]).casefold().split())
            previous_text = text_owner.setdefault(normalized, split_name)
            if previous_text != split_name:
                raise ValueError(f"Data leakage: duplicate text in {previous_text} and {split_name}")


def metrics_for(y_true, y_prob, y_pred, langs: list[str] | None = None) -> dict:
    p, r, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average="binary", pos_label=1, zero_division=0
    )
    auprc = float(average_precision_score(y_true, y_prob)) if len(set(y_true)) > 1 else 0.0
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1]).tolist()
    out = {
        "precision": float(p),
        "recall": float(r),
        "f1": float(f1),
        "auprc": auprc,
        "confusion_matrix": {"labels": ["benign", "grooming_risk"], "matrix": cm},
        "false_positives": int(cm[0][1]) if cm else None,
        "false_negatives": int(cm[1][0]) if cm else None,
        "n": int(len(y_true)),
    }
    if langs is not None:
        by_lang = {}
        for lang in sorted(set(langs)):
            idx = [i for i, L in enumerate(langs) if L == lang]
            if not idx:
                continue
            yt = y_true[idx]
            yp = y_pred[idx]
            ypr = y_prob[idx]
            pl, rl, f1l, _ = precision_recall_fscore_support(
                yt, yp, average="binary", pos_label=1, zero_division=0
            )
            by_lang[lang] = {
                "precision": float(pl),
                "recall": float(rl),
                "f1": float(f1l),
                "auprc": float(average_precision_score(yt, ypr)) if len(set(yt)) > 1 else 0.0,
                "n": len(idx),
            }
        out["by_language"] = by_lang
    return out


def main() -> int:
    train = load_jsonl(DATA / "train.jsonl")
    val = load_jsonl(DATA / "val.jsonl")
    test = load_jsonl(DATA / "test.jsonl")
    validate_split_integrity({"train": train, "val": val, "test": test})
    Xtr, ytr, _ = xy(train)
    Xva, yva, lang_va = xy(val)
    Xte, yte, lang_te = xy(test)

    pipe = Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    analyzer="char_wb",
                    ngram_range=(3, 5),
                    min_df=1,
                    max_features=50000,
                    sublinear_tf=True,
                ),
            ),
            (
                "clf",
                LogisticRegression(
                    max_iter=2000,
                    class_weight="balanced",
                    solver="liblinear",
                    random_state=42,
                ),
            ),
        ]
    )
    pipe.fit(Xtr, ytr)

    def eval_split(name: str, X, y, langs):
        prob = pipe.predict_proba(X)[:, 1]
        pred = (prob >= 0.5).astype(int)
        m = metrics_for(y, prob, pred, langs)
        print(name, json.dumps(m, ensure_ascii=False))
        return m

    OUT.mkdir(parents=True, exist_ok=True)
    report = {
        "model_id": "grooming-xlm-roberta-es-en",
        "backend": "sklearn_tfidf_v1",
        "status": "EXPERIMENTAL",
        "base_model_intended": "FacebookAI/xlm-roberta-base",
        "base_license": "MIT",
        "dataset": "kernel-grooming-synthetic-v2",
        "training_data_status": "synthetic_only_not_real_chat_validated",
        "probabilities_calibrated": False,
        "dataset_license": "CC0-1.0",
        "disclaimer": [
            "Métricas calculadas solo sobre texto sintético.",
            "No constituyen validación sobre conversaciones reales.",
            "El score no es probabilidad de delito ni prueba jurídica.",
        ],
        "val": eval_split("val", Xva, yva, lang_va),
        "test": eval_split("test", Xte, yte, lang_te),
        "train_size": len(train),
    }
    joblib.dump(
        {"pipeline": pipe, "label2id": LABEL2ID, "id2label": ID2LABEL, "report": report},
        OUT / "sklearn_experimental.joblib",
    )
    (OUT / "metrics_experimental.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    (OUT / "MODEL_CARD.md").write_text(
        "\n".join(
            [
                "# grooming-xlm-roberta-es-en (EXPERIMENTAL)",
                "",
                "## Version",
                "- Detector runtime: 0.2.0-experimental-contextual",
                "- Backend produced by this script: sklearn TF-IDF + LogisticRegression",
                "- This artifact is not XLM-R and is not validated on real conversations.",
                "",
                "## Intended base",
                "- FacebookAI/xlm-roberta-base (MIT)",
                "- Fine-tune script: scripts/train_grooming_xlm.py (requires ≥16 GB RAM recommended)",
                "",
                "## Current artifact in this tree",
                "- Backend: sklearn TF-IDF char_wb(3-5) + LogisticRegression",
                "- Reason: sandbox/host RAM insufficient for full XLM-R training here",
                "- Status: **EXPERIMENTAL**",
                "",
                "## Dataset",
                "- kernel-grooming-synthetic-v2 (CC0), see data/grooming/DATASET.md",
                "- No PAN12, no private data",
                "",
                "## Limitations",
                "- Synthetic-only metrics",
                "- Not a legal finding",
                "- Model scores are not calibrated probabilities.",
                "- Runtime adds a contextual G01-G09 heuristic evidence layer; it is not ground truth.",
                "- Hard negatives and hard positives are synthetic and do not model real prevalence.",
                "",
            ]
        ),
        encoding="utf-8",
    )
    size = (OUT / "sklearn_experimental.joblib").stat().st_size
    print("artifact_bytes", size)
    print(classification_report(yte, pipe.predict(Xte), target_names=["benign", "grooming_risk"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
Fine-tuning reproducible de FacebookAI/xlm-roberta-base (MIT).

Requisitos recomendados: ≥16 GB RAM, opcional GPU CUDA.
En hosts con poca RAM fallará al cargar el modelo; usar train_grooming_sklearn.py.

Uso:
  python scripts/train_grooming_xlm.py --output models/grooming-xlm/xlm-roberta-finetuned
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "grooming"
LABEL2ID = {"benign": 0, "grooming_risk": 1}
ID2LABEL = {0: "benign", 1: "grooming_risk"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="FacebookAI/xlm-roberta-base")
    parser.add_argument("--output", type=Path, default=ROOT / "models" / "grooming-xlm" / "xlm-roberta-finetuned")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch", type=int, default=4)
    parser.add_argument("--max-length", type=int, default=256)
    parser.add_argument("--lr", type=float, default=2e-5)
    args = parser.parse_args()

    try:
        import torch
        from datasets import Dataset
        from transformers import (
            AutoModelForSequenceClassification,
            AutoTokenizer,
            Trainer,
            TrainingArguments,
        )
    except ImportError as e:
        print("Missing deps:", e, file=sys.stderr)
        print("pip install transformers datasets accelerate torch", file=sys.stderr)
        return 2

    def load_split(name: str):
        rows = []
        for line in (DATA / f"{name}.jsonl").read_text(encoding="utf-8").splitlines():
            if line.strip():
                r = json.loads(line)
                rows.append({**r, "label_id": LABEL2ID[r["label"]]})
        return rows

    split_rows = {name: load_split(name) for name in ("train", "val", "test")}
    group_owner: dict[str, str] = {}
    text_owner: dict[str, str] = {}
    for split_name, rows in split_rows.items():
        for row in rows:
            group_id = re.sub(r"-var(?:-\d+)?$", "", str(row["id"]))
            if group_id in group_owner and group_owner[group_id] != split_name:
                raise ValueError(f"Data leakage: group {group_id} in {group_owner[group_id]} and {split_name}")
            group_owner[group_id] = split_name
            normalized = " ".join(str(row["text"]).casefold().split())
            digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
            if digest in text_owner and text_owner[digest] != split_name:
                raise ValueError(f"Data leakage: duplicate text across {text_owner[digest]} and {split_name}")
            text_owner[digest] = split_name

    tokenizer = AutoTokenizer.from_pretrained(args.model)

    def tok(batch):
        return tokenizer(batch["text"], truncation=True, max_length=args.max_length, padding="max_length")

    def to_dataset(name: str):
        items = [{"text": row["text"], "label": row["label_id"]} for row in split_rows[name]]
        dataset = Dataset.from_list(items).map(tok, batched=True)
        cols = ["input_ids", "attention_mask", "label"]
        return dataset.remove_columns([c for c in dataset.column_names if c not in cols])

    train_ds = to_dataset("train")
    val_ds = to_dataset("val")
    test_ds = to_dataset("test")

    model = AutoModelForSequenceClassification.from_pretrained(
        args.model,
        num_labels=2,
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    )

    use_fp16 = torch.cuda.is_available()
    args_tr = TrainingArguments(
        output_dir=str(args.output / "runs"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        learning_rate=args.lr,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        fp16=use_fp16,
        logging_steps=5,
        report_to=[],
    )

    def compute_metrics(eval_pred):
        import numpy as np
        from sklearn.metrics import f1_score, precision_score, recall_score

        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        return {
            "precision": float(precision_score(labels, preds, zero_division=0)),
            "recall": float(recall_score(labels, preds, zero_division=0)),
            "f1": float(f1_score(labels, preds, zero_division=0)),
        }

    trainer = Trainer(
        model=model,
        args=args_tr,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        compute_metrics=compute_metrics,
    )
    trainer.train()
    # Test is evaluated once after model selection; never used for optimization.
    test_result = trainer.predict(test_ds, metric_key_prefix="test")
    args.output.mkdir(parents=True, exist_ok=True)
    trainer.save_model(str(args.output))
    tokenizer.save_pretrained(str(args.output))
    meta = {
        "model_id": "grooming-xlm-roberta-es-en",
        "base": args.model,
        "base_license": "MIT",
        "status": "experimental_trained_xlm_not_real_chat_validated",
        "dataset": "kernel-grooming-synthetic-v2",
        "train_examples": len(train_ds),
        "validation_examples": len(val_ds),
        "test_examples": len(test_ds),
        "test_metrics": {k: float(v) for k, v in test_result.metrics.items() if isinstance(v, (int, float))},
        "probabilities_calibrated": False,
        "note": "Synthetic evaluation only. Independent real moderated data and human adjudication are required before production use.",
    }
    (args.output / "kernel_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("test_metrics", json.dumps(meta["test_metrics"], ensure_ascii=False))
    print("saved", args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

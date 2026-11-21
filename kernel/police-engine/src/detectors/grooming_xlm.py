"""
GroomingDetector — bilingual ES/EN, contextual and evidence-oriented.

The bundled estimator remains an EXPERIMENTAL TF-IDF + LogisticRegression
baseline. XLM-R is only selected when a fine-tuned local checkpoint exists.
This module emits risk indicators for human review; it never identifies a
person, establishes intent, or makes a legal finding.
"""
from __future__ import annotations

import hashlib
import re
import time
import unicodedata
from collections import defaultdict
from pathlib import Path
from typing import Any

from memory import process_rss_mb
from paths import detector_dir, MODELS_DIR
from schema import AnalysisResult, AnalysisState, ModelInfo, ModelStatus, ScoreItem

MODEL_ID = "grooming-xlm-roberta-es-en"
SKLEARN_SHA256 = "f21b13c66398253de124acdf7a4a9e86bcb6d1bca1258b95dd492aa81ede517c"
VERSION = "0.2.0-experimental-contextual"
BASE_REPO = "FacebookAI/xlm-roberta-base"
BASE_LICENSE = "MIT"
ARTIFACT_KIND = "sklearn_tfidf_experimental"  # not a trained XLM-R checkpoint

# These phrases are intentionally specific. A platform name, a compliment,
# a request for secrecy, or a question about age alone is not treated as proof.
# Pattern results are indicators only and are returned with exact source turns.
SIGNAL_RULES: tuple[dict[str, Any], ...] = (
    {
        "code": "G01", "key": "vinculo_exclusivo", "title": "Vínculo o excepcionalidad instrumental",
        "severity": "contextual", "patterns": (
            r"\beres (?:muy )?especial\b", r"\bnadie te entiende como yo\b",
            r"\bmadur[oa] para tu edad\b", r"\byou(?:'re| are) special\b",
            r"\bnobody understands you like i do\b", r"\bso mature for your age\b",
        ),
    },
    {
        "code": "G02", "key": "secreto_u_ocultacion", "title": "Secreto u ocultación de la relación",
        "severity": "high", "patterns": (
            r"\bnuestro secreto\b", r"\bes nuestro secreto\b",
            r"\bno se lo cuentes a (?:tus )?(?:padres|familia|nadie)\b",
            r"\bno le digas a nadie\b", r"\bno le cuentes a nadie\b", r"\bno le digas a (?:tus )?(?:padres|familia)\b", r"\bque nadie se entere\b",
            r"\bour secret\b", r"\bkeep (?:this|it) (?:a )?secret\b", r"\bkeep it between us\b",
            r"\bdon't tell (?:your parents|anyone|your family)\b",
        ),
    },
    {
        "code": "G03", "key": "aislamiento", "title": "Aislamiento o desautorización del entorno",
        "severity": "high", "patterns": (
            r"\bno conf[ií]es en tus padres\b", r"\bal[eé]jate de tus amigos\b",
            r"\bsolo me necesitas a m[ií]\b", r"\bno necesitas a tus amigos\b",
            r"\bthey don't understand you\b", r"\byou only need me\b",
            r"\bstay away from your friends\b", r"\bdon't trust your parents\b",
        ),
    },
    {
        "code": "G04", "key": "obtencion_datos_privados", "title": "Obtención de datos personales o de vulnerabilidad",
        "severity": "contextual", "patterns": (
            r"\bcu[aá]ntos a[nñ]os tienes\b", r"\bqu[eé] edad tienes\b",
            r"\best[aá]s solo en casa\b", r"\ben qu[eé] colegio estudias\b",
            r"\ba qu[eé] hora salen tus padres\b", r"\bhow old are you\b",
            r"\bare you home alone\b", r"\bwhat school do you go to\b",
            r"\bwhen are your parents away\b",
        ),
    },
    {
        "code": "G05", "key": "migracion_canal_borrado", "title": "Migración a canal privado o eliminación de rastros",
        "severity": "high", "patterns": (
            r"\bpasa(?:mos)? a (?:telegram|signal|snapchat|discord|otra app)\b", r"\bpasa a otra app\b",
            r"\bcambia(?:mos)? de (?:app|aplicaci[oó]n|plataforma)\b",
            r"\bborra (?:el )?(?:historial|chat|conversaci[oó]n|mensajes)\b",
            r"\belimina (?:el )?(?:historial|chat|mensajes)\b", r"\bno dejes rastro\b",
            r"\bmove to (?:telegram|signal|snapchat|discord|another app)\b", r"\bmove to another app\b",
            r"\bswitch to (?:a )?(?:private|another) app\b",
            r"\bdelete (?:the )?(?:chat|history|messages)\b",
            r"\bno one can read (?:our )?messages\b",
        ),
    },
    {
        "code": "G06", "key": "regalos_dependencia", "title": "Regalos, favores o recompensas condicionadas",
        "severity": "contextual", "patterns": (
            r"\bte compro .* si\b", r"\bte regalo .* si\b",
            r"\bsi me haces caso te compro\b", r"\bte dar[eé] .* si no se lo cuentas\b",
            r"\bi(?:'ll| will) buy you .* if\b", r"\bi(?:'ll| will) get you .* if\b",
            r"\bgift .* if you (?:listen|keep it secret)\b",
        ),
    },
    {
        "code": "G07", "key": "coaccion_amenaza", "title": "Coacción, chantaje o amenaza",
        "severity": "critical", "patterns": (
            r"\bsi (?:no lo haces|no me haces caso|hablas con alguien) .* (?:consecuencias|me enfadar[eé])\b",
            r"\bme decepcionar[aá]s si\b", r"\bte vas a arrepentir\b",
            r"\bsi lo cuentas\b.*\b(?:te|voy a|ensenare|mostrare|contare)\b", r"\bsi no lo haces .* (?:ensenare|contare)\b",
            r"\bi(?:'ll| will) expose you\b", r"\bi(?:'ll| will) show everyone\b",
            r"\byou(?:'ll| will) regret it\b", r"\bif you tell anyone .* (?:you(?:'ll| will)|i(?:'ll| will))\b",
            r"\bif you really (?:love|care about) me .*\b",
        ),
    },
    {
        "code": "G08", "key": "limites_intimos", "title": "Petición de imágenes privadas o transgresión de límites íntimos",
        "severity": "critical", "patterns": (
            r"\bfoto(?:graf[ií]a)?s? [a-z ]{0,20}(?:[ií]ntima|privada)\b",
            r"\bm[aá]ndame una foto .* solo para m[ií]\b",
            r"\bsend me a private photo\b", r"\bsend a picture .* just for me\b",
            r"\bprivate picture of you\b", r"\bnudes?\b",
        ),
    },
    {
        "code": "G09", "key": "encuentro_clandestino", "title": "Propuesta de encuentro oculto o clandestino",
        "severity": "critical", "patterns": (
            r"\bvernos a escondidas\b", r"\bquedamos a escondidas\b", r"\bquedamos sin que (?:tus )?(?:padres|nadie) lo sepa\b",
            r"\bnos vemos sin que (?:tu )?(?:madre|padre|familia) lo sepa\b",
            r"\bmeet without telling (?:your parents|anyone)\b",
            r"\blet's meet secretly\b", r"\bmeet when nobody is around\b",
        ),
    },
)

_REPORTING_CONTEXT_RE = re.compile(
    r"\b(?:me dijo que|me pidio que|me amenazo|mi amigo me dijo|mi amiga me dijo|"
    r"alguien me dijo|estoy denunciando|he denunciado|lo he reportado|"
    r"someone told me|my friend said|they told me|i reported|i am reporting|"
    r"this is an example|ejemplo de una conversacion)\b"
)
_SPEAKER_RE = re.compile(r"^\s*(?P<speaker>[\wÁÉÍÓÚÜÑáéíóúüñ .-]{1,32})\s*:\s*(?P<body>.*)$")


def _normalize(text: str) -> str:
    value = unicodedata.normalize("NFKD", text or "")
    return "".join(ch for ch in value if not unicodedata.combining(ch)).lower()


def _detect_language(text: str) -> str:
    t = f" {_normalize(text)} "
    es = sum(1 for m in (" que ", " de ", " la ", " el ", " los ", " para ", " con ", " por ", " no ", " una ") if m in t)
    en = sum(1 for m in (" the ", " and ", " you ", " your ", " for ", " with ", " this ", " that ", " don't ", " are ") if m in t)
    if es and en and min(es, en) / max(es, en) > 0.35:
        return "mixed"
    if es == 0 and en == 0:
        return "unknown"
    return "es" if es >= en else "en"


def _parse_turns(text: str) -> list[dict[str, Any]]:
    """Parse explicit speaker labels without inventing speaker identities."""
    turns: list[dict[str, Any]] = []
    for line_no, raw_line in enumerate((text or "").splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        match = _SPEAKER_RE.match(line)
        if match:
            speaker = match.group("speaker").strip()
            body = match.group("body").strip()
            if body:
                turns.append({"turn_index": len(turns) + 1, "source_line": line_no, "speaker": speaker, "text": body})
        else:
            # Unlabelled lines remain separate turns but are never assigned to an actor.
            turns.append({"turn_index": len(turns) + 1, "source_line": line_no, "speaker": None, "text": line})
    return turns


def _is_clear_benign_context(normalized: str, code: str) -> bool:
    # Narrow counter-contexts reduce predictable false alarms. These are not
    # general exemptions and do not claim that a message is safe.
    if code == "G02" and re.search(r"\b(?:fiesta|cumpleanos|birthday) (?:sorpresa|surprise)\b", normalized):
        return True
    if code == "G04" and re.search(r"\b(?:torneo|competicion|categoria sub|tournament|age group|registration)\b", normalized):
        return True
    if code == "G05" and re.search(r"\b(?:grupo oficial|canal oficial|grupo del club|grupo de clase|official club group|class group|coach|entrenador)\b", normalized):
        return True
    return False


def _detect_signals(turns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    found: list[dict[str, Any]] = []
    for turn in turns:
        normalized = _normalize(turn["text"])
        reported_context = bool(_REPORTING_CONTEXT_RE.search(normalized))
        for rule in SIGNAL_RULES:
            if _is_clear_benign_context(normalized, rule["code"]):
                continue
            matches = [p for p in rule["patterns"] if re.search(p, normalized, flags=re.IGNORECASE)]
            if not matches:
                continue
            found.append({
                "code": rule["code"],
                "category": rule["key"],
                "title": rule["title"],
                "severity": rule["severity"],
                "turn_index": turn["turn_index"],
                "source_line": turn["source_line"],
                "speaker": turn["speaker"],
                "speaker_attribution": "reported_or_quoted" if reported_context else (
                    "explicit_speaker_label" if turn["speaker"] else "unknown_speaker"
                ),
                "evidence": turn["text"][:1000],
                "matched_pattern_count": len(matches),
                "heuristic_only": True,
                "note": "Indicador textual heurístico; no demuestra por sí solo intención, identidad ni delito.",
            })
    return found


def _window_segments(text: str, max_chars: int = 1200, overlap: int = 200) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    turns = [ln for ln in text.splitlines() if ln.strip()]
    if len(turns) >= 2:
        segs: list[str] = []
        buf: list[str] = []
        size = 0
        for ln in turns:
            if size + len(ln) + 1 > max_chars and buf:
                segs.append("\n".join(buf))
                keep: list[str] = []
                ksize = 0
                for previous in reversed(buf):
                    if ksize + len(previous) > overlap:
                        break
                    keep.insert(0, previous)
                    ksize += len(previous)
                buf = keep + [ln]
                size = sum(len(x) + 1 for x in buf)
            else:
                buf.append(ln)
                size += len(ln) + 1
        if buf:
            segs.append("\n".join(buf))
        return segs
    if len(text) <= max_chars:
        return [text]
    return [text[i : i + max_chars] for i in range(0, len(text), max_chars - overlap)]


def _aggregate_window_scores(scores: list[float]) -> dict[str, float]:
    """Aggregate overlapping windows without allowing one max-score to dominate."""
    if not scores:
        return {"score": 0.0, "mean": 0.0, "top2_mean": 0.0, "support_ratio": 0.0, "max": 0.0}
    clean = [min(1.0, max(0.0, float(s))) for s in scores]
    mean_score = sum(clean) / len(clean)
    top2 = sorted(clean, reverse=True)[:2]
    top2_mean = sum(top2) / len(top2)
    support_ratio = sum(1 for score in clean if score >= 0.5) / len(clean)
    # The score is a ranking aid, not a calibrated probability.
    combined = clean[0] if len(clean) == 1 else (0.55 * mean_score + 0.30 * top2_mean + 0.15 * support_ratio)
    return {
        "score": round(combined, 6),
        "mean": round(mean_score, 6),
        "top2_mean": round(top2_mean, 6),
        "support_ratio": round(support_ratio, 6),
        "max": round(max(clean), 6),
    }


def _assessment(turns: list[dict[str, Any]], signals: list[dict[str, Any]], aggregate: dict[str, float], text: str) -> dict[str, Any]:
    actor_signals = [s for s in signals if s["speaker_attribution"] == "explicit_speaker_label"]
    by_speaker: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for signal in actor_signals:
        by_speaker[str(signal["speaker"])].append(signal)
    dominant_speaker = None
    dominant_items: list[dict[str, Any]] = []
    if by_speaker:
        dominant_speaker, dominant_items = max(by_speaker.items(), key=lambda item: (len(item[1]), item[0]))
    unique_categories = sorted({s["code"] for s in dominant_items})
    unique_signal_turns = len({s["turn_index"] for s in dominant_items})
    high_signal_count = sum(1 for s in dominant_items if s["severity"] == "critical")
    all_severities = {s["severity"] for s in signals}
    review_priority = (
        "urgent_human_review" if "critical" in all_severities
        else "elevated_human_review" if "high" in all_severities
        else "standard_review"
    )
    sufficient_context = len(turns) >= 2 and len((text or "").strip()) >= 40

    if not sufficient_context:
        level = "context_insufficient"
        decision = "Contexto insuficiente: no se emite una conclusión global."
    elif dominant_speaker and high_signal_count >= 2 and len(unique_categories) >= 2 and unique_signal_turns >= 2:
        level = "priority_review"
        decision = "Varias señales críticas en mensajes atribuidos al mismo interlocutor; requiere revisión humana prioritaria."
    elif dominant_speaker and len(unique_categories) >= 2 and unique_signal_turns >= 2:
        level = "convergent_pattern"
        decision = "Señales de distintas categorías en varios turnos del mismo interlocutor; revisar el contexto completo."
    elif signals:
        level = "isolated_signals"
        decision = "Se han encontrado señales aisladas o sin atribución suficiente; no permiten concluir un patrón."
    elif aggregate["score"] >= 0.75:
        level = "model_flag_no_structured_signals"
        decision = "El clasificador experimental marca el texto, pero la capa de señales no encuentra corroboración estructurada."
    else:
        level = "no_structured_signals_detected"
        decision = "No se han detectado señales estructuradas en el texto aportado; esto no demuestra que la conversación sea segura."

    if level in {"priority_review", "convergent_pattern"}:
        top_label = "grooming_risk"
    elif level == "no_structured_signals_detected" and aggregate["score"] < 0.5:
        top_label = "benign"
    else:
        top_label = None  # abstain on insufficient, isolated or conflicting evidence

    return {
        "risk_level": level,
        "review_priority": review_priority,
        "review_priority_is_triage_only": True,
        "decision_note": decision,
        "top_label": top_label,
        "context_sufficient": sufficient_context,
        "turn_count": len(turns),
        "explicit_speaker_count": len({t["speaker"] for t in turns if t["speaker"]}),
        "dominant_speaker": dominant_speaker,
        "speaker_attribution": "explicit_speaker_label" if dominant_speaker else "insufficient_for_actor_attribution",
        "signal_count": len(signals),
        "signal_categories": sorted({s["code"] for s in signals}),
        "same_speaker_signal_categories": unique_categories,
        "same_speaker_signal_turn_count": unique_signal_turns,
        "model_score": aggregate["score"],
        "model_score_calibrated": False,
        "aggregation": {
            "method": "mean_top2_support_v1",
            "window_count": None,
            "mean_score": aggregate["mean"],
            "top2_mean_score": aggregate["top2_mean"],
            "support_ratio_at_0_5": aggregate["support_ratio"],
            "max_window_score_diagnostic_only": aggregate["max"],
        },
        "confidence_statement": "No es una probabilidad calibrada. La puntuación solo ordena el resultado del clasificador experimental.",
        "human_review_required": True,
    }


class GroomingDetector:
    id = MODEL_ID
    name = "Grooming risk ES/EN (experimental contextual; XLM-R planned)"
    license = BASE_LICENSE
    version = VERSION

    def __init__(self) -> None:
        self._backend: str | None = None
        self._sklearn = None
        self._xlm_model = None
        self._xlm_tokenizer = None
        self._status = ModelStatus.NOT_INSTALLED
        self._error: str | None = None
        self._local = detector_dir(self.id)
        self._bundle = Path(__file__).resolve().parents[2] / "models" / "grooming-xlm"
        self._refresh_status()

    def _sklearn_path(self) -> Path | None:
        p = self._bundle / "sklearn_experimental.joblib"
        if p.exists():
            if hashlib.sha256(p.read_bytes()).hexdigest() == SKLEARN_SHA256:
                return p
            self._error = "Checkpoint sklearn con hash no válido; no se carga."
        return None

    def _xlm_path(self) -> Path | None:
        for base in (self._local, self._bundle, MODELS_DIR / "grooming-xlm"):
            cfg = base / "xlm-roberta-finetuned" / "config.json"
            if cfg.exists():
                return cfg.parent
            if (base / "config.json").exists() and (
                (base / "model.safetensors").exists() or (base / "pytorch_model.bin").exists()
            ):
                return base
        return None

    def _refresh_status(self) -> None:
        if self._sklearn is not None or self._xlm_model is not None:
            self._status = ModelStatus.LOADED
        elif self._sklearn_path() or self._xlm_path():
            self._status = ModelStatus.READY
        else:
            self._status = ModelStatus.NOT_INSTALLED

    def info(self) -> ModelInfo:
        self._refresh_status()
        notes = [
            f"Identificador: {MODEL_ID}",
            f"Base prevista: {BASE_REPO} ({BASE_LICENSE})",
            "Backend incluido: TF-IDF + LogisticRegression experimental; no es XLM-R fine-tuned.",
            "Incluye una capa heurística contextual G01-G09; sus señales no son hechos probados.",
            "El score no está calibrado y no es probabilidad de delito.",
            "No infiere edad, identidad, relación ni culpabilidad de los interlocutores.",
            "Validación con conversaciones reales: no realizada.",
            "PaxmodGuard es un detector independiente; Grooming G01-G09 conserva su propia evaluación experimental.",
        ]
        if self._backend:
            notes.append(f"Backend cargado: {self._backend}")
        return ModelInfo(
            id=self.id, name=self.name, version=self.version, license=self.license,
            status=self._status.value, repo_id=BASE_REPO,
            files=["sklearn_experimental.joblib", "xlm-roberta-finetuned/"],
            local_dir=str(self._local), error=self._error,
            memory_rss_mb=process_rss_mb() if self._status == ModelStatus.LOADED else None,
            loaded=self._sklearn is not None or self._xlm_model is not None,
            notes=notes,
        )

    def download(self, on_progress=None) -> ModelInfo:
        """Do not download an unfine-tuned XLM-R base as though it were a classifier."""
        self._error = None
        if self._sklearn_path() is not None or self._xlm_path() is not None:
            self._status = ModelStatus.READY
            return self.info()
        self._status = ModelStatus.ERROR
        self._error = (
            "No hay checkpoint de grooming instalado. XLM-R base no es un clasificador; "
            "primero debe existir un checkpoint fine-tuned validado."
        )
        return self.info()

    def load(self, prefer_cpu: bool = True) -> ModelInfo:
        if self._sklearn is not None or self._xlm_model is not None:
            return self.info()
        self._status = ModelStatus.LOADING
        self._error = None
        xlm_dir = self._xlm_path()
        if xlm_dir is not None:
            try:
                import torch
                from transformers import AutoModelForSequenceClassification, AutoTokenizer

                device = "cpu" if prefer_cpu or not torch.cuda.is_available() else "cuda"
                self._xlm_tokenizer = AutoTokenizer.from_pretrained(str(xlm_dir), local_files_only=True)
                self._xlm_model = AutoModelForSequenceClassification.from_pretrained(str(xlm_dir), local_files_only=True)
                self._xlm_model.eval()
                self._xlm_model.to(device)
                self._device = device
                config_labels = getattr(self._xlm_model.config, "id2label", {}) or {}
                self._id2label = {int(k): str(v).lower() for k, v in config_labels.items()}
                if set(self._id2label) != {0, 1}:
                    self._id2label = {0: "benign", 1: "grooming_risk"}
                self._backend = "xlm"
                self._status = ModelStatus.LOADED
                return self.info()
            except Exception as e:
                self._xlm_model = None
                self._xlm_tokenizer = None
                self._error = f"XLM load failed: {e}"
        sk = self._sklearn_path()
        if sk is not None:
            try:
                import joblib
                blob = joblib.load(sk)
                self._sklearn = blob["pipeline"]
                self._id2label = blob.get("id2label", {0: "benign", 1: "grooming_risk"})
                self._backend = "sklearn_experimental"
                self._status = ModelStatus.LOADED
                self._error = None
                return self.info()
            except Exception as e:
                self._error = str(e)
                self._status = ModelStatus.ERROR
                return self.info()
        self._status = ModelStatus.NOT_INSTALLED
        self._error = "No hay checkpoint instalado; revisa el artefacto local y su hash."
        return self.info()

    def unload(self) -> ModelInfo:
        self._sklearn = None
        self._xlm_model = None
        self._xlm_tokenizer = None
        self._backend = None
        self._refresh_status()
        return self.info()

    def _score_text(self, text: str) -> tuple[float, dict[str, float]]:
        if self._backend == "sklearn_experimental" and self._sklearn is not None:
            proba = self._sklearn.predict_proba([text])[0]
            scores: dict[str, float] = {}
            for i, class_id in enumerate(self._sklearn.classes_):
                label = self._id2label.get(int(class_id), str(class_id))
                scores[label] = float(proba[i])
            return scores.get("grooming_risk", 0.0), scores
        if self._backend == "xlm" and self._xlm_model is not None:
            import torch
            import torch.nn.functional as F

            enc = self._xlm_tokenizer(text, return_tensors="pt", truncation=True, max_length=256, padding=True)
            enc = {k: v.to(self._device) for k, v in enc.items()}
            with torch.no_grad():
                logits = self._xlm_model(**enc).logits[0]
                probs = F.softmax(logits, dim=-1).cpu().tolist()
            scores = {self._id2label.get(i, str(i)): float(probs[i]) for i in range(len(probs))}
            # Normalize aliases from some Transformers configs.
            normalized = {k.lower(): v for k, v in scores.items()}
            risk = normalized.get("grooming_risk", normalized.get("label_1", 0.0))
            benign = normalized.get("benign", normalized.get("label_0", 1.0 - risk))
            return risk, {"benign": benign, "grooming_risk": risk}
        raise RuntimeError("No backend loaded")

    def analyze(self, text: str) -> AnalysisResult:
        limitations = [
            "Checkpoint sklearn experimental; corpus sintético pequeño y sin validación real.",
            "La puntuación del clasificador no está calibrada y no es probabilidad de delito.",
            "Las reglas G01-G09 son heurísticas lingüísticas; pueden fallar con ironía, citas, variantes o contexto ausente.",
            "No se infieren edad, identidad, relación, intención ni culpabilidad.",
            "Una etiqueta benigna no demuestra que la conversación sea segura.",
            "Revisión humana obligatoria antes de cualquier decisión o actuación.",
        ]
        if self._sklearn is None and self._xlm_model is None:
            return AnalysisResult(
                model_id=self.id, model_version=self.version, state=AnalysisState.MODEL_NOT_READY.value,
                labels=[], top_label=None, language=_detect_language(text or ""), relevant_fragments=[],
                raw_scores={}, limitations=limitations, latency_ms=None, error="GroomingDetector no cargado.",
            )
        text = (text or "").strip()
        if not text:
            return AnalysisResult(
                model_id=self.id, model_version=self.version, state=AnalysisState.ERROR.value,
                labels=[], top_label=None, language=None, relevant_fragments=[], raw_scores={},
                limitations=limitations, latency_ms=0, error="Texto vacío.",
            )

        self._status = ModelStatus.INFERRING
        t0 = time.perf_counter()
        try:
            turns = _parse_turns(text)
            signals = _detect_signals(turns)
            segments = _window_segments(text)
            per_window: list[dict[str, Any]] = []
            for index, segment in enumerate(segments, start=1):
                risk, _window_class_scores = self._score_text(segment)
                per_window.append({"index": index, "risk": risk})
            aggregate = _aggregate_window_scores([item["risk"] for item in per_window])
            assessment = _assessment(turns, signals, aggregate, text)
            assessment["aggregation"]["window_count"] = len(per_window)
            assessment["window_scores"] = per_window[:50]
            assessment["signal_evidence"] = signals[:30]

            risk = aggregate["score"]
            scores = {"grooming_risk": float(risk), "benign": float(1.0 - risk)}
            ordered_scores = sorted(scores.items(), key=lambda pair: pair[1], reverse=True)
            labels = [ScoreItem(label=key, score=value) for key, value in ordered_scores]
            fragments: list[dict[str, Any]] = []
            for signal in signals[:20]:
                fragments.append({
                    "text": signal["evidence"],
                    "source": "heuristic_signal",
                    "signal_code": signal["code"],
                    "category": signal["category"],
                    "title": signal["title"],
                    "severity": signal["severity"],
                    "speaker": signal["speaker"],
                    "speaker_attribution": signal["speaker_attribution"],
                    "turn_index": signal["turn_index"],
                    "source_line": signal["source_line"],
                    "note": signal["note"],
                })
            if not fragments:
                ranked_windows = sorted(per_window, key=lambda item: item["risk"], reverse=True)
                for item in ranked_windows[:2]:
                    fragments.append({
                        "text": segments[item["index"] - 1][:1000],
                        "source": "model_window",
                        "grooming_risk_score": round(item["risk"], 6),
                        "note": "Ventana señalada por el clasificador experimental; sin señal G01-G09 corroborada.",
                    })

            latency = (time.perf_counter() - t0) * 1000
            self._status = ModelStatus.LOADED
            notes = [
                assessment["decision_note"],
                f"Nivel de evaluación: {assessment['risk_level']}.",
                f"Señales G01-G09: {assessment['signal_count']} en {len(assessment['signal_categories'])} categorías.",
                f"Atribución: {assessment['speaker_attribution']}; no se asignan edades ni roles personales.",
                "La puntuación es no calibrada; las reglas son indicadores heurísticos, no prueba.",
                "Revisión humana obligatoria.",
            ]
            return AnalysisResult(
                model_id=self.id, model_version=f"{self.version}+{self._backend}",
                state=AnalysisState.OK.value, labels=labels, top_label=assessment["top_label"],
                language=_detect_language(text), relevant_fragments=fragments,
                raw_scores=scores, limitations=limitations, latency_ms=round(latency, 2),
                notes=notes, metadata={"grooming_assessment": assessment},
            )
        except Exception as e:
            self._status = ModelStatus.LOADED
            return AnalysisResult(
                model_id=self.id, model_version=self.version, state=AnalysisState.ERROR.value,
                labels=[], top_label=None, language=_detect_language(text), relevant_fragments=[],
                raw_scores={}, limitations=limitations,
                latency_ms=(time.perf_counter() - t0) * 1000, error=str(e),
            )

    def status(self) -> ModelInfo:
        return self.info()

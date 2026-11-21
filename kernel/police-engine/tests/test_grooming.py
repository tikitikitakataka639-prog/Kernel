from __future__ import annotations

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from detectors.grooming_xlm import (  # noqa: E402
    GroomingDetector,
    _aggregate_window_scores,
    _assessment,
    _detect_signals,
    _parse_turns,
)
from detectors.paxmod_guard import PaxmodGuardDetector  # noqa: E402
from engine import PoliceEngine  # noqa: E402
from schema import AnalysisState, ModelStatus  # noqa: E402


class GroomingContextTests(unittest.TestCase):
    def test_parse_turns_preserves_explicit_speakers_and_unknown_turns(self):
        turns = _parse_turns("SpeakerA: Hola\nSpeakerB: Qué tal\nUna línea sin etiqueta")
        self.assertEqual(len(turns), 3)
        self.assertEqual(turns[0]["speaker"], "SpeakerA")
        self.assertEqual(turns[1]["speaker"], "SpeakerB")
        self.assertIsNone(turns[2]["speaker"])

    def test_all_nine_taxonomy_families_have_examples(self):
        examples = {
            "G01": "Eres muy especial y nadie te entiende como yo.",
            "G02": "No le digas a nadie que hablamos.",
            "G03": "No confíes en tus padres, solo me necesitas a mí.",
            "G04": "¿Estás solo en casa esta tarde?",
            "G05": "Pasa a otra app y borra el chat.",
            "G06": "Te compro una consola si haces lo que te pido.",
            "G07": "Si lo cuentas, voy a enseñar tus mensajes.",
            "G08": "Mándame una foto privada solo para mí.",
            "G09": "Quedamos a escondidas sin que tus padres lo sepan.",
        }
        for expected, message in examples.items():
            with self.subTest(code=expected):
                detected = {item["code"] for item in _detect_signals(_parse_turns(f"SpeakerA: {message}"))}
                self.assertIn(expected, detected)

    def test_secrecy_and_channel_migration_are_separate_signals(self):
        turns = _parse_turns(
            "SpeakerA: No le digas a tus padres que hablamos.\n"
            "SpeakerB: No me gusta.\n"
            "SpeakerA: Pasa a otra app y borra el chat."
        )
        signals = _detect_signals(turns)
        self.assertIn("G02", {item["code"] for item in signals})
        self.assertIn("G05", {item["code"] for item in signals})
        self.assertTrue(all(item["speaker"] == "SpeakerA" for item in signals))

    def test_birthday_secret_is_not_treated_as_secrecy_signal(self):
        turns = _parse_turns(
            "SpeakerA: No le cuentes a nadie lo de la fiesta sorpresa de cumpleaños.\n"
            "SpeakerB: Vale, será una sorpresa."
        )
        signals = _detect_signals(turns)
        self.assertNotIn("G02", {item["code"] for item in signals})

    def test_official_club_channel_is_not_channel_migration_signal(self):
        turns = _parse_turns(
            "SpeakerA: Pasa al Telegram oficial del club para ver los horarios.\n"
            "SpeakerB: Vale, está el entrenador."
        )
        signals = _detect_signals(turns)
        self.assertNotIn("G05", {item["code"] for item in signals})

    def test_age_question_in_tournament_context_is_not_private_data_signal(self):
        turns = _parse_turns(
            "SpeakerA: ¿Cuántos años tienes? Es para la categoría sub-16 del torneo.\n"
            "SpeakerB: Quince."
        )
        signals = _detect_signals(turns)
        self.assertNotIn("G04", {item["code"] for item in signals})

    def test_reported_or_quoted_signal_is_not_attributed_to_reporter_as_actor(self):
        turns = _parse_turns(
            "SpeakerA: Mi amigo me dijo que no le digas a nadie y que borres los mensajes.\n"
            "SpeakerB: Deberías contárselo a un adulto de confianza."
        )
        signals = _detect_signals(turns)
        self.assertTrue(signals)
        self.assertTrue(all(item["speaker_attribution"] == "reported_or_quoted" for item in signals))
        assessment = _assessment(turns, signals, _aggregate_window_scores([0.4]), "\n".join(t["text"] for t in turns))
        self.assertIsNone(assessment["dominant_speaker"])
        self.assertNotEqual(assessment["risk_level"], "convergent_pattern")

    def test_single_signal_abstains_instead_of_global_conclusion(self):
        turns = _parse_turns("SpeakerA: No le digas a nadie que hablamos.\nSpeakerB: ¿Por qué?")
        signals = _detect_signals(turns)
        assessment = _assessment(turns, signals, _aggregate_window_scores([0.9]), "SpeakerA: No le digas a nadie que hablamos.\nSpeakerB: ¿Por qué?")
        self.assertEqual(assessment["risk_level"], "isolated_signals")
        self.assertIsNone(assessment["top_label"])

    def test_convergent_pattern_requires_same_speaker_and_multiple_turns(self):
        text = (
            "SpeakerA: No le digas a tus padres que hablamos.\n"
            "SpeakerB: No quiero ocultarlo.\n"
            "SpeakerA: Pasa a otra app y borra el chat."
        )
        turns = _parse_turns(text)
        signals = _detect_signals(turns)
        assessment = _assessment(turns, signals, _aggregate_window_scores([0.7, 0.8]), text)
        self.assertEqual(assessment["risk_level"], "convergent_pattern")
        self.assertEqual(assessment["top_label"], "grooming_risk")
        self.assertEqual(assessment["dominant_speaker"], "SpeakerA")

    def test_priority_review_requires_repeated_critical_signal_categories(self):
        text = (
            "SpeakerA: Mándame una foto privada solo para mí.\n"
            "SpeakerB: No quiero.\n"
            "SpeakerA: Quedamos a escondidas sin que tus padres lo sepan."
        )
        turns = _parse_turns(text)
        signals = _detect_signals(turns)
        assessment = _assessment(turns, signals, _aggregate_window_scores([0.7, 0.8]), text)
        self.assertEqual(assessment["risk_level"], "priority_review")
        self.assertEqual(assessment["top_label"], "grooming_risk")

    def test_max_window_does_not_dominate_multiwindow_aggregation(self):
        result = _aggregate_window_scores([0.95, 0.10, 0.08, 0.09])
        self.assertLess(result["score"], 0.5)
        self.assertEqual(result["max"], 0.95)
        self.assertEqual(result["support_ratio"], 0.25)

    def test_context_insufficient_abstains(self):
        turns = _parse_turns("SpeakerA: No le digas a nadie.")
        signals = _detect_signals(turns)
        assessment = _assessment(turns, signals, _aggregate_window_scores([0.99]), "SpeakerA: No le digas a nadie.")
        self.assertEqual(assessment["risk_level"], "context_insufficient")
        self.assertEqual(assessment["review_priority"], "elevated_human_review")
        self.assertIsNone(assessment["top_label"])


class GroomingIntegrationTests(unittest.TestCase):
    def test_engine_lists_grooming(self):
        eng = PoliceEngine()
        ids = {d["id"] for d in eng.status()["detectors"]}
        self.assertIn("grooming-xlm-roberta-es-en", ids)
        self.assertIn("paxmod-guard", ids)

    def test_download_uses_bundled_checkpoint_without_fetching_base_xlm(self):
        g = GroomingDetector()
        info = g.download()
        self.assertEqual(info.status, ModelStatus.READY.value)
        self.assertIsNone(info.error)

    def test_es_en_inference_returns_structured_assessment(self):
        g = GroomingDetector()
        info = g.load()
        if not info.loaded:
            self.skipTest(info.error or "no checkpoint")
        es_text = (
            "SpeakerA: No le digas a tus padres que hablamos.\n"
            "SpeakerB: No me gusta.\n"
            "SpeakerA: Pasa a otra app y borra el chat."
        )
        en_text = (
            "SpeakerA: Don't tell your parents about our chats.\n"
            "SpeakerB: I don't like that.\n"
            "SpeakerA: Switch to another app and delete the chat."
        )
        es = g.analyze(es_text)
        en = g.analyze(en_text)
        self.assertEqual(es.state, AnalysisState.OK.value)
        self.assertEqual(en.state, AnalysisState.OK.value)
        self.assertEqual(es.metadata["grooming_assessment"]["risk_level"], "convergent_pattern")
        self.assertEqual(en.metadata["grooming_assessment"]["risk_level"], "convergent_pattern")
        self.assertTrue(es.relevant_fragments)
        self.assertTrue(all("signal_code" in item for item in es.relevant_fragments))
        self.assertIn(es.language, ("es", "mixed", "unknown"))
        self.assertIn(en.language, ("en", "mixed", "unknown"))

    def test_empty_text_returns_error_not_a_benign_result(self):
        g = GroomingDetector()
        info = g.load()
        if not info.loaded:
            self.skipTest(info.error or "no checkpoint")
        result = g.analyze("   ")
        self.assertEqual(result.state, AnalysisState.ERROR.value)
        self.assertIsNone(result.top_label)


if __name__ == "__main__":
    unittest.main()

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from detectors.horizon import _read_label_order


class HorizonLabelOrderTest(unittest.TestCase):
    def test_reads_real_model_id2label_order(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / "config.json"
            config.write_text(json.dumps({
                "id2label": {
                    "0": "legitimate",
                    "1": "spam",
                    "2": "fraud",
                }
            }), encoding="utf-8")
            self.assertEqual(_read_label_order(config), ("legitimate", "spam", "fraud"))

    def test_rejects_missing_or_ambiguous_mapping(self):
        with tempfile.TemporaryDirectory() as tmp:
            config = Path(tmp) / "config.json"
            config.write_text(json.dumps({"id2label": {"0": "fraud"}}), encoding="utf-8")
            with self.assertRaises(ValueError):
                _read_label_order(config)


if __name__ == "__main__":
    unittest.main()

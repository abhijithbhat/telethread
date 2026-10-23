"""
Unit tests for TeleThread Sarvam AI Service & Autonomous Clinical Agent
"""

import os
import unittest
from unittest.mock import MagicMock, patch

import sys
from unittest.mock import MagicMock

# Mock third-party dependencies if running in minimal environment without pip packages
for mod_name in [
    "fastapi", "pydantic", "sqlalchemy", "sqlalchemy.orm",
    "sqlalchemy.orm.attributes", "google", "google.genai"
]:
    if mod_name not in sys.modules:
        sys.modules[mod_name] = MagicMock()

from sarvam_service import (
    SarvamKeyRotator,
    get_key_pool_status,
    synthesize_speech_sarvam,
    transcribe_audio_sarvam,
)
from routes_agent import (
    _extract_triage_deterministic,
    _evaluate_consult_copilot,
)


class TestSarvamKeyRotator(unittest.TestCase):
    def setUp(self):
        self.rotator = SarvamKeyRotator()

    def test_empty_rotator(self):
        status = self.rotator.get_key_pool_status()
        self.assertEqual(status["total_keys"], 0)
        self.assertFalse(status["has_keys"])

    def test_add_runtime_keys_string(self):
        count = self.rotator.add_keys("key_alpha, key_beta, key_gamma")
        self.assertEqual(count, 3)
        status = self.rotator.get_key_pool_status()
        self.assertEqual(status["total_keys"], 3)
        self.assertTrue(status["has_keys"])

    def test_add_runtime_keys_list(self):
        count = self.rotator.add_keys(["key_1", "key_2, key_3"])
        self.assertEqual(count, 3)

    def test_key_rotation(self):
        self.rotator.add_keys(["key_1", "key_2", "key_3"])
        self.assertEqual(self.rotator.active_key_index, 0)
        self.rotator.rotate_key()
        self.assertEqual(self.rotator.active_key_index, 1)
        self.rotator.rotate_key()
        self.assertEqual(self.rotator.active_key_index, 2)
        self.rotator.rotate_key()
        self.assertEqual(self.rotator.active_key_index, 0)


class TestBilingualTriageParser(unittest.TestCase):
    def test_kannada_emergency_triage(self):
        utterance = "ತುರ್ತು ಕೇಸ್ ದಾಖಲಿಸಿ, ರೋಗಿ ರಮೇಶ್ ಗೌಡ, ವಯಸ್ಸು 54, ಸುಳ್ಯ, ಎದೆ ನೋವು ಮತ್ತು ಹಾವು ಕಡಿತ, SpO2 89%, BP 185/110"
        result = _extract_triage_deterministic(utterance)
        self.assertEqual(result["patient_name"], "Ramesh Gowda")
        self.assertEqual(result["age"], 54)
        self.assertEqual(result["gender"], "M")
        self.assertIn("Sullia", result["village_taluka"])
        self.assertIn("chest_pain", result["symptoms"])
        self.assertIn("snakebite_trauma", result["symptoms"])
        self.assertEqual(result["vitals"]["spo2"], 89)
        self.assertEqual(result["vitals"]["bp_systolic"], 185)
        self.assertEqual(result["vitals"]["bp_diastolic"], 110)
        self.assertIn("ತುರ್ತು ಪರಿಸ್ಥಿತಿ", result["spoken_reply_kn"])

    def test_english_routine_triage(self):
        utterance = "Patient Manjula Nayak, 36 years old female from Karkala with skin rash and high fever, SpO2 98, BP 120/80"
        result = _extract_triage_deterministic(utterance)
        self.assertEqual(result["patient_name"], "Manjula Nayak")
        self.assertEqual(result["age"], 36)
        self.assertEqual(result["gender"], "F")
        self.assertIn("Karkala", result["village_taluka"])
        self.assertIn("skin_rash", result["symptoms"])
        self.assertEqual(result["vitals"]["spo2"], 98)
        self.assertIn("complete", result["spoken_reply_en"].lower())

    def test_do_your_work_default(self):
        utterance = "Do your work and register the patient"
        result = _extract_triage_deterministic(utterance)
        self.assertIsNotNone(result["patient_name"])
        self.assertTrue(len(result["symptoms"]) > 0)
        self.assertIn("bp_systolic", result["vitals"])


class TestConsultCopilot(unittest.TestCase):
    def test_cardiac_consult_recommendations(self):
        utterance = "Patient is having severe chest pain and breathlessness"
        res = _evaluate_consult_copilot(utterance, None)
        self.assertIn("Aspirin", res["recommendation"])
        self.assertTrue(any("Aspirin" in m["name"] for m in res["draft_rx"]))
        self.assertIn("ಡಾಕ್ಟರ್", res["spoken_reply_kn"])


class TestSarvamFallbacks(unittest.TestCase):
    def test_stt_browser_fallback_when_no_keys(self):
        rotator = SarvamKeyRotator()
        with patch("sarvam_service.sarvam_rotator", rotator):
            res = transcribe_audio_sarvam(b"mock_audio", "test.webm", "kn-IN")
            self.assertEqual(res["provider"], "browser_fallback")
            self.assertEqual(res["transcript"], "")

    def test_tts_browser_fallback_when_no_keys(self):
        rotator = SarvamKeyRotator()
        with patch("sarvam_service.sarvam_rotator", rotator):
            res = synthesize_speech_sarvam("Hello", "en-IN")
            self.assertEqual(res["provider"], "browser_tts_fallback")
            self.assertIsNone(res["audio_base64"])

    def test_stt_rotation_on_401(self):
        rotator = SarvamKeyRotator()
        rotator.add_keys(["bad_key", "good_key"])

        mock_bad_resp = MagicMock()
        mock_bad_resp.status_code = 401
        mock_bad_resp.text = "Unauthorized"

        mock_good_resp = MagicMock()
        mock_good_resp.status_code = 200
        mock_good_resp.json.return_value = {"transcript": "ತುರ್ತು ಚಿಕಿತ್ಸೆ", "language_code": "kn-IN"}

        # Mock httpx client
        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client.post.side_effect = [mock_bad_resp, mock_good_resp]

        mock_httpx = MagicMock()
        mock_httpx.Client.return_value = mock_client

        with patch("sarvam_service.sarvam_rotator", rotator), \
             patch("sarvam_service.httpx", mock_httpx):
            res = transcribe_audio_sarvam(b"mock_bytes", "test.webm", "kn-IN")
            self.assertEqual(res["transcript"], "ತುರ್ತು ಚಿಕಿತ್ಸೆ")
            self.assertTrue(res["fallback_used"])
            self.assertIn("Key #2", res["provider"])

    def test_tts_retry_on_400_bulbul_v2(self):
        rotator = SarvamKeyRotator()
        rotator.add_keys(["valid_key"])

        mock_v3_resp = MagicMock()
        mock_v3_resp.status_code = 400
        mock_v3_resp.text = "Bad Request (Schema mismatch)"

        mock_v2_resp = MagicMock()
        mock_v2_resp.status_code = 200
        mock_v2_resp.json.return_value = {"audios": ["b64_audio_sample"]}

        mock_client = MagicMock()
        mock_client.__enter__.return_value = mock_client
        mock_client.post.side_effect = [mock_v3_resp, mock_v2_resp]

        mock_httpx = MagicMock()
        mock_httpx.Client.return_value = mock_client

        with patch("sarvam_service.sarvam_rotator", rotator), \
             patch("sarvam_service.httpx", mock_httpx):
            res = synthesize_speech_sarvam("ತುರ್ತು ಪರಿಸ್ಥಿತಿ", "kn-IN")
            self.assertEqual(res["audio_base64"], "b64_audio_sample")
            self.assertIn("Sarvam Bulbul TTS", res["provider"])


if __name__ == "__main__":
    unittest.main()

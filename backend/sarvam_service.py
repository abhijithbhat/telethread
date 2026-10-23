"""
TeleThread Sarvam AI Service - Multi-Key Rotation Engine for STT and TTS

Provides:
- SarvamKeyRotator: Key manager reading SARVAM_API_KEYS / SARVAM_API_KEY env vars
  plus dynamic in-memory runtime keys from the frontend UI.
- transcribe_audio_sarvam: Multi-key rotating Speech-to-Text (saaras:v3)
  with graceful local browser fallback.
- synthesize_speech_sarvam: Multi-key rotating Text-to-Speech (bulbul:v3 / bulbul:v2)
  with graceful local browser TTS fallback.
"""

import base64
import logging
import os
from typing import Any, Dict, List, Optional, Union
try:
    import httpx
except ImportError:
    httpx = None

try:
    import requests
except ImportError:
    requests = None

logger = logging.getLogger(__name__)


class SarvamKeyRotator:
    """
    Manages a pool of Sarvam API keys with automatic failover rotation.
    Combines keys from:
    1. SARVAM_API_KEYS (comma-separated env var)
    2. SARVAM_API_KEY (single fallback env var)
    3. runtime_keys (in-memory list added dynamically via REST API)
    """

    def __init__(self):
        self.runtime_keys: List[str] = []
        self.active_key_index: int = 0

    def _get_env_keys(self) -> List[str]:
        keys = []
        multi_keys = os.getenv("SARVAM_API_KEYS", "").strip()
        if multi_keys:
            for k in multi_keys.split(","):
                cleaned = k.strip()
                if cleaned and cleaned not in keys:
                    keys.append(cleaned)

        single_key = os.getenv("SARVAM_API_KEY", "").strip()
        if single_key and single_key not in keys:
            keys.append(single_key)

        return keys

    def get_all_keys(self) -> List[str]:
        """Returns ordered, deduplicated list of all available keys."""
        all_keys = []
        # Runtime keys take priority for active overrides
        for k in self.runtime_keys:
            if k and k not in all_keys:
                all_keys.append(k)

        # Then environment keys
        for k in self._get_env_keys():
            if k and k not in all_keys:
                all_keys.append(k)

        return all_keys

    def add_keys(self, new_keys: Union[str, List[str]]) -> int:
        """
        Adds one or more keys to the runtime key pool.
        Returns the new total count of keys.
        """
        if isinstance(new_keys, str):
            # Split comma, newline, or whitespace separated keys
            candidates = [k.strip() for k in new_keys.replace("\n", ",").split(",") if k.strip()]
        elif isinstance(new_keys, list):
            candidates = []
            for item in new_keys:
                if isinstance(item, str):
                    for sub in item.replace("\n", ",").split(","):
                        if sub.strip():
                            candidates.append(sub.strip())
        else:
            candidates = []

        added = 0
        for k in candidates:
            if k not in self.runtime_keys:
                self.runtime_keys.append(k)
                added += 1

        logger.info(f"Added {added} new runtime Sarvam keys. Total in pool: {len(self.get_all_keys())}")
        return len(self.get_all_keys())

    def get_key_pool_status(self) -> Dict[str, Any]:
        """Exposes status of key pool for health checks and UI badges without exposing raw keys."""
        keys = self.get_all_keys()
        total = len(keys)
        idx = self.active_key_index if total > 0 else 0
        if total > 0:
            idx = idx % total
        masked_keys = [f"{k[:4]}...{k[-4:]}" for k in keys if len(k) > 8]
        return {
            "total_keys": total,
            "active_key_index": idx,
            "has_keys": total > 0,
            "masked_active_key": masked_keys[idx] if total > 0 and len(masked_keys) > idx else None,
            "masked_keys": masked_keys,
        }

    def rotate_key(self):
        """Advances active key index to the next key in the pool."""
        keys = self.get_all_keys()
        if keys:
            self.active_key_index = (self.active_key_index + 1) % len(keys)
            logger.warning(f"Rotated Sarvam API key to index {self.active_key_index + 1}/{len(keys)}")


# Global singleton rotator instance
sarvam_rotator = SarvamKeyRotator()


def get_key_pool_status() -> Dict[str, Any]:
    """Helper function returning current key pool status."""
    return sarvam_rotator.get_key_pool_status()


def transcribe_audio_sarvam(
    file_bytes: bytes,
    filename: str = "audio.webm",
    language_code: str = "kn-IN",
    mime_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Transcribes audio bytes using Sarvam AI Speech-to-Text API (saaras:v3).
    Automatically rotates through available API keys on 401, 402, 403, 429, or 5xx.
    Falls back gracefully to local browser fallback on failure without raising exceptions.
    """
    if not file_bytes:
        logger.warning("Empty audio payload received for transcription.")
        return {
            "transcript": "",
            "language_code": language_code,
            "provider": "browser_fallback",
            "error": "No audio data recorded",
        }

    # 10 MB payload security check
    MAX_AUDIO_BYTES = 10 * 1024 * 1024
    if len(file_bytes) > MAX_AUDIO_BYTES:
        logger.warning(f"Audio payload exceeds 10 MB limit ({len(file_bytes)} bytes)")
        return {
            "transcript": "",
            "language_code": language_code,
            "provider": "browser_fallback",
            "error": "Audio file exceeds 10 MB limit",
        }

    keys = sarvam_rotator.get_all_keys()
    if not keys:
        logger.warning("No Sarvam API keys available in rotator. Returning browser fallback.")
        return {
            "transcript": "",
            "language_code": language_code,
            "provider": "browser_fallback",
            "error": "No Sarvam API keys configured in pool",
        }

    # Determine MIME container type based on filename & mime_type (stripping ;codecs=opus)
    fname = filename or "audio.webm"
    fname_lower = fname.lower()
    if mime_type and "/" in mime_type:
        content_type = mime_type.split(";")[0].strip()
    elif fname_lower.endswith(".mp4") or fname_lower.endswith(".m4a"):
        content_type = "audio/mp4"
    elif fname_lower.endswith(".aac"):
        content_type = "audio/aac"
    elif fname_lower.endswith(".wav"):
        content_type = "audio/wav"
    elif fname_lower.endswith(".mp3"):
        content_type = "audio/mpeg"
    elif fname_lower.endswith(".ogg"):
        content_type = "audio/ogg"
    else:
        content_type = "audio/webm"

    # Normalize: strip any residual codecs
    if ";" in content_type:
        content_type = content_type.split(";")[0].strip()

    url = "https://api.sarvam.ai/speech-to-text"
    num_keys = len(keys)
    start_idx = sarvam_rotator.active_key_index % num_keys

    # Try all keys starting from current active index
    for attempt in range(num_keys):
        idx = (start_idx + attempt) % num_keys
        key = keys[idx]

        headers = {
            "api-subscription-key": key,
        }
        files = {
            "file": (fname, file_bytes, content_type),
        }
        data = {
            "model": "saaras:v3",
            "language_code": language_code,
            "mode": "transcribe",
        }

        try:
            if httpx:
                with httpx.Client(timeout=12.0) as client:
                    resp = client.post(url, headers=headers, files=files, data=data)
            elif requests:
                resp = requests.post(url, headers=headers, files=files, data=data, timeout=12.0)
            else:
                raise RuntimeError("Neither httpx nor requests library is installed")

            if resp.status_code == 200:
                resp_json = resp.json()
                transcript = resp_json.get("transcript", "").strip()
                detected_lang = resp_json.get("language_code", language_code)
                sarvam_rotator.active_key_index = idx  # Keep this working key as primary
                logger.info(f"Sarvam STT success with Key #{idx+1}: {transcript[:50]}...")
                return {
                    "transcript": transcript,
                    "language_code": detected_lang,
                    "provider": f"Sarvam AI (Key #{idx + 1})",
                    "fallback_used": attempt > 0,
                }
            elif resp.status_code in (401, 402, 403, 429) or resp.status_code >= 500:
                logger.warning(
                    f"Sarvam STT failed with Key #{idx+1} (HTTP {resp.status_code}): {resp.text[:120]}. Rotating..."
                )
                sarvam_rotator.rotate_key()
                continue
            else:
                logger.warning(f"Sarvam STT unexpected response (HTTP {resp.status_code}): {resp.text[:120]}")
                continue
        except Exception as exc:
            logger.warning(f"Sarvam STT network error on Key #{idx+1}: {exc}. Rotating...")
            sarvam_rotator.rotate_key()
            continue

    return {
        "transcript": "",
        "language_code": language_code,
        "provider": "browser_fallback",
        "error": "Using local browser speech recognition",
    }


def synthesize_speech_sarvam(
    text: str,
    language_code: str = "kn-IN",
    speaker: str = "shubh",
) -> Dict[str, Any]:
    """
    Synthesizes speech using Sarvam AI Text-to-Speech API.
    Primary model: bulbul:v3 (with speaker=speaker, pace=1.0)
    Secondary fallback: bulbul:v2 (with speaker="anushka")
    Rotates through keys on failure. Returns base64 audio or browser fallback.
    """
    clean_text = (text or "").strip()
    if not clean_text:
        return {"audio_base64": None, "provider": "browser_tts_fallback"}

    keys = sarvam_rotator.get_all_keys()
    if not keys:
        logger.warning("No Sarvam API keys available for TTS. Returning browser_tts_fallback.")
        return {"audio_base64": None, "provider": "browser_tts_fallback"}

    url = "https://api.sarvam.ai/text-to-speech"
    num_keys = len(keys)
    start_idx = sarvam_rotator.active_key_index % num_keys

    for attempt in range(num_keys):
        idx = (start_idx + attempt) % num_keys
        key = keys[idx]

        headers = {
            "api-subscription-key": key,
            "Content-Type": "application/json",
        }

        # Attempt 1: bulbul:v3
        payload_v3 = {
            "text": clean_text[:1500],
            "target_language_code": language_code,
            "model": "bulbul:v3",
            "speaker": speaker or "shubh",
            "pace": 1.0,
            "speech_sample_rate": 22050,
        }

        try:
            if httpx:
                with httpx.Client(timeout=14.0) as client:
                    resp = client.post(url, headers=headers, json=payload_v3)

                    # If bulbul:v3 returned 400 schema error, retry once with bulbul:v2
                    if resp.status_code == 400:
                        payload_v2 = {
                            "inputs": [clean_text[:500]],
                            "target_language_code": language_code,
                            "model": "bulbul:v2",
                            "speaker": "anushka",
                        }
                        resp = client.post(url, headers=headers, json=payload_v2)
            elif requests:
                resp = requests.post(url, headers=headers, json=payload_v3, timeout=14.0)
                if resp.status_code == 400:
                    payload_v2 = {
                        "inputs": [clean_text[:500]],
                        "target_language_code": language_code,
                        "model": "bulbul:v2",
                        "speaker": "anushka",
                    }
                    resp = requests.post(url, headers=headers, json=payload_v2, timeout=14.0)
            else:
                raise RuntimeError("Neither httpx nor requests library is installed")

            if resp.status_code == 200:
                resp_json = resp.json()
                audios = resp_json.get("audios") or []
                audio_b64 = audios[0] if audios else None

                if audio_b64:
                    sarvam_rotator.active_key_index = idx
                    logger.info(f"Sarvam TTS success with Key #{idx+1}")
                    return {
                        "audio_base64": audio_b64,
                        "language_code": language_code,
                        "provider": f"Sarvam Bulbul TTS (Key #{idx + 1})",
                        "fallback_used": attempt > 0,
                    }
            elif resp.status_code in (401, 402, 403, 429) or resp.status_code >= 500:
                logger.warning(
                    f"Sarvam TTS failed with Key #{idx+1} (HTTP {resp.status_code}): {resp.text[:120]}. Rotating..."
                )
                sarvam_rotator.rotate_key()
                continue
            else:
                logger.warning(f"Sarvam TTS error with Key #{idx+1} (HTTP {resp.status_code}): {resp.text[:120]}")
                continue

        except Exception as exc:
            logger.warning(f"Sarvam TTS network error on Key #{idx+1}: {exc}. Rotating...")
            sarvam_rotator.rotate_key()
            continue

    return {"audio_base64": None, "provider": "browser_tts_fallback"}

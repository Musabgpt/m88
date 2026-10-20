"""Regression tests for keyless free-provider discovery on desktop."""
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from . import provider_pool


class KeylessKiloFallbackTests(unittest.TestCase):
    def setUp(self):
        provider_pool.reset_health()

    def test_discovers_verified_kilo_free_models_when_current_model_is_not_kilo(self):
        # Linux may start with a local model or another provider. That must not
        # suppress discovery of Kilo's verified zero-price model fallbacks.
        client = SimpleNamespace(spec={
            "id": "local/gguf",
            "model": "local-model",
            "base_url": "http://127.0.0.1:1234/v1",
        })
        catalog = {"data": [{
            "id": "stepfun/test:free",
            "pricing": {"prompt": "0", "completion": "0"},
            "supported_parameters": ["tools"],
            "architecture": {"input_modalities": ["text"]},
        }]}
        with patch.object(provider_pool, "_fetch_kilo_catalog", return_value=catalog):
            candidates = provider_pool.candidates(client, {"tools"})
        self.assertIn("stepfun/test:free", [item["model"] for item in candidates])
        item = next(item for item in candidates if item["model"] == "stepfun/test:free")
        self.assertEqual(item["base_url"], provider_pool.KILO_BASE)
        self.assertEqual(item["api_key"], "")
        self.assertIs(item["free"], True)

    def test_does_not_discover_kilo_when_gateway_is_in_cooldown(self):
        client = SimpleNamespace(spec={
            "id": "local/gguf",
            "model": "local-model",
            "base_url": "http://127.0.0.1:1234/v1",
        })
        provider_pool._mark_failure(
            {"id": "gateway:" + provider_pool.KILO_BASE},
            RuntimeError("gateway unavailable"),
        )
        with patch.object(provider_pool, "_fetch_kilo_catalog") as fetch:
            candidates = provider_pool.candidates(client, {"tools"})
        fetch.assert_not_called()
        self.assertFalse(any(item.get("base_url") == provider_pool.KILO_BASE for item in candidates))


if __name__ == "__main__":
    unittest.main()

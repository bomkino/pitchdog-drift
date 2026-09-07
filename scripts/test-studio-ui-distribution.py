#!/usr/bin/env python3
"""Tests the actual distribution guard; does not claim application acceptance."""
import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("studio_guard", pathlib.Path(__file__).with_name("verify-studio-ui-distribution.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class DistributionGuardTests(unittest.TestCase):
    def test_existing_identity_without_pilot_is_unchanged(self):
        module.verify({"source": "original"})
        module.verify({"studioUI": {"mode": "system", "revision": None}})

    def test_pilot_and_unknown_modes_cannot_be_archived(self):
        for mode in ["pilot", "pinned", "", None]:
            with self.subTest(mode=mode), self.assertRaises(ValueError):
                module.verify({"studioUI": {"mode": mode, "revision": "a" * 40}})

    def test_malformed_and_contradictory_identity_is_rejected(self):
        for value in [None, [], "system", {"studioUI": None}, {"studioUI": "system"}, {"studioUI": {}}, {"studioUI": {"mode": "system", "revision": "a" * 40}}]:
            with self.subTest(value=value), self.assertRaises(ValueError):
                module.verify(value)


if __name__ == "__main__":
    unittest.main()

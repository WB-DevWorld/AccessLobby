import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from infra.scripts import iam_network_smoke as smoke


def source_config():
    return {
        "services": {
            "iam-db": {"image": "postgres:17.11", "networks": {"backend": {}}},
            "iam": {"image": "fixture-iam", "networks": {"backend": {}, "iam-edge": {}, "iam-egress": {}},
                    "volumes": [{"source": "/original", "target": "/opt/keycloak/data/import"}]},
            "api": {"image": "not-started"},
        },
        "networks": {"backend": {"internal": True}, "iam-edge": {"internal": True},
                     "iam-egress": {"internal": False}},
    }


class IamNetworkSmokeTests(unittest.TestCase):
    def test_fixture_preserves_source_network_policy_and_does_not_start_api(self):
        source = source_config()
        with tempfile.TemporaryDirectory() as folder:
            legacy, desired = smoke.fixture_configs(source, Path(folder))
        self.assertEqual(set(desired["services"]), {"iam", "iam-db"})
        self.assertEqual(desired["services"]["iam"]["networks"], source["services"]["iam"]["networks"])
        self.assertEqual(desired["services"]["iam-db"], source["services"]["iam-db"])
        self.assertEqual(desired["networks"], source["networks"])
        self.assertNotIn("iam-egress", legacy["services"]["iam"]["networks"])
        self.assertEqual(source["services"]["iam"]["volumes"][0]["source"], "/original")

    def test_fixture_never_injects_egress_missing_from_production_source(self):
        source = source_config()
        del source["services"]["iam"]["networks"]["iam-egress"]
        with tempfile.TemporaryDirectory() as folder:
            _, desired = smoke.fixture_configs(source, Path(folder))
        self.assertNotIn("iam-egress", desired["services"]["iam"]["networks"])

    def test_route_reader_requires_an_up_ipv4_default_route(self):
        header = "Iface Destination Gateway Flags RefCnt Use Metric Mask\n"
        self.assertEqual(smoke.route_gateways(header + "eth0 00000000 010012AC 0003 0 0 0 00000000\n"),
                         ["172.18.0.1"])
        self.assertEqual(smoke.route_gateways(header + "eth0 000012AC 00000000 0001 0 0 0 00FFFFFF\n"), [])

    def test_live_fixture_refuses_to_run_outside_github_ci(self):
        with patch.dict(os.environ, {"GITHUB_ACTIONS": "false", "CI": "false"}), patch.object(smoke, "docker") as command:
            with self.assertRaisesRegex(RuntimeError, "ci_only"):
                smoke.smoke("fixture")
        command.assert_not_called()


if __name__ == "__main__":
    unittest.main()

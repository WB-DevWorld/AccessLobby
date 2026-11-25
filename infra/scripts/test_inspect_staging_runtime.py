import json
import os
import stat
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from infra.scripts import inspect_staging_runtime as inspector

MANIFEST = Path(__file__).parents[1] / "releases/staging-2026-09-28.json"
MAIN = "accesslobby-main-staging"
CONSUMER = "accesslobby-consumer-staging"


def container(project, service, image, *, job=False, health=None, networks=None, published=False):
    return {
        "project": project, "service": service, "imageRef": image,
        "state": "exited" if job else "running", "exitCode": 0, "health": health,
        "localImageId": "sha256:" + "a" * 64,
        "networks": {name: {} for name in (networks or [])},
        "ports": {"8080/tcp": [{"HostPort": "8080"}] if published else None},
        "otherUnusedData": "IAM_ADMIN_PASSWORD=never-export-this",
    }


def complete_inventory(manifest):
    images = manifest["images"]
    main = []
    for service, image_key in inspector.MAIN_SERVICES.items():
        image = images[image_key] if image_key else "postgres:17.11"
        networks = [MAIN + "_backend"]
        if service == "iam":
            networks.extend([MAIN + "_iam-edge", MAIN + "_iam-egress"])
        if service == "iam-gateway":
            networks = [MAIN + "_iam-edge", "dokploy-network"]
        if service in {"api", "web"}:
            networks.append("dokploy-network")
        main.append(container(MAIN, service, image, job=service in inspector.JOBS,
                              health="healthy" if service.endswith("-db") else None,
                              networks=networks))
    consumer = [container(CONSUMER, "consumer", images["consumer"],
                          networks=["dokploy-network"])]
    return {"main": main, "consumer": consumer}


def complete_network_inventory():
    return [{"name": MAIN + "_" + name, "driver": "bridge", "internal": internal, "peerCount": peers}
            for name, internal, peers in (("backend", True, 5), ("iam-edge", True, 2),
                                          ("iam-egress", False, 1))]


class RuntimeInventoryTests(unittest.TestCase):
    def setUp(self):
        self.manifest = inspector.load_manifest(MANIFEST)
        self.projects = {"main": MAIN, "consumer": CONSUMER}

    def assess(self, inventory):
        return inspector.assess(self.manifest, self.projects, inventory, complete_network_inventory())

    def test_complete_digest_pinned_private_topology_passes_without_exporting_environment(self):
        report = self.assess(complete_inventory(self.manifest))
        self.assertTrue(report["passed"])
        self.assertTrue(report["networkPolicyPassed"])
        self.assertEqual(len(report["services"]), 9)
        self.assertNotIn("never-export-this", json.dumps(report))

    def test_wrong_image_failed_job_and_exposed_database_fail(self):
        inventory = complete_inventory(self.manifest)
        by_service = {item["service"]: item
                      for item in inventory["main"]}
        by_service["iam"]["imageRef"] = "quay.io/keycloak/keycloak:26"
        by_service["iam-config"]["exitCode"] = 1
        by_service["iam-db"]["networks"]["dokploy-network"] = {}
        by_service["iam-db"]["ports"]["5432/tcp"] = [{"HostPort": "5432"}]
        report = self.assess(inventory)
        self.assertFalse(report["passed"])
        self.assertFalse(report["networkPolicyPassed"])
        self.assertEqual({item["code"] for item in report["failures"]},
                         {"image_ref_mismatch", "job_not_completed", "private_network_mismatch",
                          "host_port_published"})

    def test_missing_and_duplicate_services_fail(self):
        inventory = complete_inventory(self.manifest)
        inventory["consumer"].clear()
        inventory["main"].append(inventory["main"][0])
        report = self.assess(inventory)
        self.assertFalse(report["networkPolicyPassed"])
        self.assertEqual({item["code"] for item in report["failures"]},
                         {"missing_service", "duplicate_service"})

    def test_database_without_health_result_fails(self):
        inventory = complete_inventory(self.manifest)
        inventory["main"][0]["health"] = None
        report = self.assess(inventory)
        self.assertTrue(report["networkPolicyPassed"])
        self.assertEqual([item["code"] for item in report["failures"]],
                         ["database_not_healthy"])

    def test_manifest_rejects_mutable_image(self):
        candidate = json.loads(MANIFEST.read_text())
        candidate["images"]["api"] = "ghcr.io/wb-devworld/accesslobby-api:latest"
        with self.assertRaises(ValueError):
            inspector.load_manifest_data(candidate)

    def test_docker_inventory_requests_only_selected_fields(self):
        item = complete_inventory(self.manifest)["consumer"][0]
        with patch.object(inspector, "docker", side_effect=["example-container-id\n", json.dumps(item) + "\n"]) as call:
            self.assertEqual(inspector.inventory(CONSUMER), [item])
        self.assertIn("--format", call.call_args_list[1].args)
        self.assertNotIn(".Config.Env", inspector.INSPECT_FORMAT)

    def test_private_report_is_created_with_restrictive_permissions(self):
        inventory = complete_inventory(self.manifest)
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "runtime.json"
            argv = ["inspect_staging_runtime.py", "--main-project", MAIN,
                    "--consumer-project", CONSUMER, "--manifest", str(MANIFEST),
                    "--output", str(output)]
            with patch("sys.argv", argv), patch.object(inspector, "inventory",
                                                      side_effect=[inventory["main"], inventory["consumer"]]), \
                    patch.object(inspector, "network_inventory", return_value=complete_network_inventory()):
                self.assertEqual(inspector.main(), 0)
            self.assertEqual(stat.S_IMODE(os.stat(output).st_mode), 0o600)
            self.assertTrue(json.loads(output.read_text())["passed"])

    def test_missing_egress_or_temporary_default_or_proxy_attachment_fails(self):
        for networks in ([MAIN + "_backend", MAIN + "_iam-edge"],
                         [MAIN + "_backend", MAIN + "_iam-edge", MAIN + "_default"],
                         [MAIN + "_backend", MAIN + "_iam-edge", MAIN + "_iam-egress", "dokploy-network"]):
            with self.subTest(networks=networks):
                inventory = complete_inventory(self.manifest)
                iam = next(item for item in inventory["main"] if item["service"] == "iam")
                iam["networks"] = {name: {} for name in networks}
                report = self.assess(inventory)
                self.assertFalse(report["passed"])
                self.assertFalse(report["networkPolicyPassed"])
                self.assertIn("private_network_mismatch", {item["code"] for item in report["failures"]})

    def test_another_service_may_not_share_the_iam_egress_bridge(self):
        for service in ("iam-db", "api", "iam-gateway", "consumer"):
            with self.subTest(service=service):
                inventory = complete_inventory(self.manifest)
                target = next(item for items in inventory.values() for item in items if item["service"] == service)
                target["networks"][MAIN + "_iam-egress"] = {}
                report = self.assess(inventory)
                self.assertFalse(report["networkPolicyPassed"])
                self.assertIn("iam_egress_not_exclusive", {item["code"] for item in report["failures"]})

    def test_actual_network_isolation_driver_and_external_peer_count_are_checked(self):
        for name, field, value, code in (
            ("backend", "internal", False, "network_isolation_mismatch"),
            ("iam-edge", "internal", False, "network_isolation_mismatch"),
            ("iam-egress", "internal", True, "network_isolation_mismatch"),
            ("iam-egress", "driver", "host", "network_isolation_mismatch"),
            ("iam-egress", "peerCount", 2, "iam_egress_not_exclusive"),
        ):
            with self.subTest(name=name, field=field):
                networks = complete_network_inventory()
                next(item for item in networks if item["name"] == MAIN + "_" + name)[field] = value
                report = inspector.assess(self.manifest, self.projects, complete_inventory(self.manifest), networks)
                self.assertFalse(report["networkPolicyPassed"])
                self.assertIn(code, {item["code"] for item in report["failures"]})

    def test_missing_and_duplicate_network_inspection_fails(self):
        networks = complete_network_inventory()
        for candidate in (networks[:2], networks + [networks[0]]):
            report = inspector.assess(self.manifest, self.projects, complete_inventory(self.manifest), candidate)
            self.assertFalse(report["passed"])
            self.assertFalse(report["networkPolicyPassed"])

    def test_absent_completed_job_containers_do_not_hide_network_verdict_or_pass_deployment(self):
        inventory = complete_inventory(self.manifest)
        inventory["main"] = [item for item in inventory["main"] if item["service"] not in inspector.JOBS]
        report = self.assess(inventory)
        self.assertTrue(report["networkPolicyPassed"])
        self.assertFalse(report["passed"])
        self.assertEqual({(item["code"], item["service"]) for item in report["failures"]},
                         {("missing_service", "iam-config"), ("missing_service", "migrate")})
        # Missing jobs must never obscure an actual port exposure on a running service.
        next(item for item in inventory["main"] if item["service"] == "iam")["ports"]["8080/tcp"] = [{"HostPort": "8080"}]
        self.assertFalse(self.assess(inventory)["networkPolicyPassed"])

    def test_failed_or_missing_jobs_keep_cli_nonzero_even_when_network_policy_passes(self):
        for state in ("absent", "failed"):
            with self.subTest(state=state), tempfile.TemporaryDirectory() as folder:
                inventory = complete_inventory(self.manifest)
                if state == "absent":
                    inventory["main"] = [item for item in inventory["main"] if item["service"] not in inspector.JOBS]
                else:
                    next(item for item in inventory["main"] if item["service"] == "migrate")["exitCode"] = 1
                output = Path(folder) / "runtime.json"
                argv = ["inspect_staging_runtime.py", "--main-project", MAIN,
                        "--consumer-project", CONSUMER, "--manifest", str(MANIFEST), "--output", str(output)]
                with patch("sys.argv", argv), patch.object(inspector, "inventory",
                                                          side_effect=[inventory["main"], inventory["consumer"]]), \
                        patch.object(inspector, "network_inventory", return_value=complete_network_inventory()):
                    self.assertEqual(inspector.main(), 1)
                report = json.loads(output.read_text())
                self.assertTrue(report["networkPolicyPassed"])
                self.assertFalse(report["passed"])

    def test_network_inspection_never_requests_network_peer_details(self):
        networks = complete_network_inventory()
        with patch.object(inspector, "docker", return_value="\n".join(json.dumps(item) for item in networks)) as call:
            self.assertEqual(inspector.network_inventory(MAIN), networks)
        self.assertIn("--format", call.call_args.args)
        self.assertIn("peerCount", inspector.NETWORK_INSPECT_FORMAT)
        self.assertNotIn(".Config.Env", inspector.NETWORK_INSPECT_FORMAT)


if __name__ == "__main__":
    unittest.main()

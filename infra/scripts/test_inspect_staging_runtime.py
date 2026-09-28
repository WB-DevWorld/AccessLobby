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
            networks.append(MAIN + "_iam-edge")
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


class RuntimeInventoryTests(unittest.TestCase):
    def setUp(self):
        self.manifest = inspector.load_manifest(MANIFEST)
        self.projects = {"main": MAIN, "consumer": CONSUMER}

    def test_complete_digest_pinned_private_topology_passes_without_exporting_environment(self):
        report = inspector.assess(self.manifest, self.projects, complete_inventory(self.manifest))
        self.assertTrue(report["passed"])
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
        report = inspector.assess(self.manifest, self.projects, inventory)
        self.assertFalse(report["passed"])
        self.assertEqual({item["code"] for item in report["failures"]},
                         {"image_ref_mismatch", "job_not_completed", "private_network_mismatch",
                          "host_port_published"})

    def test_missing_and_duplicate_services_fail(self):
        inventory = complete_inventory(self.manifest)
        inventory["consumer"].clear()
        inventory["main"].append(inventory["main"][0])
        report = inspector.assess(self.manifest, self.projects, inventory)
        self.assertEqual({item["code"] for item in report["failures"]},
                         {"missing_service", "duplicate_service"})

    def test_database_without_health_result_fails(self):
        inventory = complete_inventory(self.manifest)
        inventory["main"][0]["health"] = None
        report = inspector.assess(self.manifest, self.projects, inventory)
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
                                                      side_effect=[inventory["main"], inventory["consumer"]]):
                self.assertEqual(inspector.main(), 0)
            self.assertEqual(stat.S_IMODE(os.stat(output).st_mode), 0o600)
            self.assertTrue(json.loads(output.read_text())["passed"])


if __name__ == "__main__":
    unittest.main()

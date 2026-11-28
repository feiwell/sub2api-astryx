import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from functools import partial
from http.server import BaseHTTPRequestHandler, SimpleHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location("updater", Path(__file__).with_name("server.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SHA = "a" * 40
OLD_SHA = "b" * 40


class QuietStaticHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class AuthorizationTests(unittest.TestCase):
    def setUp(self):
        class Auth(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                self.server.last_headers = dict(self.headers)
                token = self.headers.get("Authorization")
                code = 401 if token == "Bearer invalid" else 503 if token == "Bearer unavailable" else 200
                self.send_response(code)
                self.end_headers()
                payload = {"data": {"role": "admin" if token == "Bearer administrator" else "user"}}
                self.wfile.write(json.dumps(payload).encode())

        self.auth = ThreadingHTTPServer(("127.0.0.1", 0), Auth)
        self.server = ThreadingHTTPServer(("127.0.0.1", 0), module.Handler)
        self.server.auth_url = "http://127.0.0.1:%s/auth/me" % self.auth.server_port
        self.server.public_origin = "https://xshell.club"
        self.server.updater = unittest.mock.Mock()
        self.server.updater.status.return_value = {"current_sha": OLD_SHA, "latest_sha": SHA}
        self.server.updater.start.return_value = {"state": "running"}
        self.threads = [threading.Thread(target=server.serve_forever, daemon=True)
                        for server in (self.auth, self.server)]
        for thread in self.threads:
            thread.start()

    def tearDown(self):
        for server in (self.auth, self.server):
            server.shutdown()
            server.server_close()
        for thread in self.threads:
            thread.join()

    def request(self, path="/api/ui-update/status", token=None, method="GET", origin=None):
        headers = {"User-Agent": "Test administrator browser", "X-Real-IP": "192.0.2.1",
                   "X-Forwarded-For": "192.0.2.1"}
        if token:
            headers["Authorization"] = "Bearer " + token
        if origin:
            headers["Origin"] = origin
        request = Request("http://127.0.0.1:%s%s" % (self.server.server_port, path),
                          headers=headers, method=method)
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response), response.headers

    def test_status_requires_login(self):
        code, _, headers = self.request()
        self.assertEqual(code, 401)
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.server.updater.status.assert_not_called()

    def test_invalid_token_and_backend_failure(self):
        self.assertEqual(self.request(token="invalid")[0], 401)
        self.assertEqual(self.request(token="unavailable")[0], 502)

    def test_regular_user_cannot_check_or_apply(self):
        self.assertEqual(self.request(token="user")[0], 403)
        self.assertEqual(self.request("/api/ui-update/apply", "user", "POST")[0], 403)
        self.server.updater.start.assert_not_called()

    def test_admin_status_force_and_apply(self):
        self.assertEqual(self.request("/api/ui-update/status?force=1", "administrator")[0], 200)
        self.server.updater.status.assert_called_once_with(force=True)
        self.assertEqual(self.auth.last_headers["User-Agent"], "Test administrator browser")
        self.assertEqual(self.auth.last_headers["X-Forwarded-For"], "192.0.2.1")
        self.assertEqual(self.request("/api/ui-update/apply", "administrator", "POST",
                                      "https://xshell.club")[0], 202)
        self.server.updater.start.assert_called_once()

    def test_cross_origin_apply_rejected(self):
        self.assertEqual(self.request("/api/ui-update/apply", "administrator", "POST",
                                      "https://other.example")[0], 403)
        self.server.updater.start.assert_not_called()

    def test_unknown_endpoint_rejected(self):
        self.assertEqual(self.request("/api/ui-update/anything", "administrator")[0], 404)


@unittest.skipIf(os.name == "nt", "Release symlinks and subprocess groups use the Linux deployment runtime")
class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.releases = self.root / "releases"
        self.releases.mkdir()
        old = self.releases / OLD_SHA
        (old / "assets").mkdir(parents=True)
        (old / "index.html").write_text("old index")
        (self.releases / "current").symlink_to(OLD_SHA)
        assets = self.releases / "assets"
        assets.mkdir()
        (assets / "old.js").write_text("old asset")
        self.updater = module.Updater(self.root / "state", self.releases, "http://127.0.0.1:1/index.html")
        self.dist = self.root / "dist"
        (self.dist / "assets").mkdir(parents=True)
        (self.dist / "index.html").write_text('<head></head><script type="module" src="/assets/new.js"></script>')
        (self.dist / "assets" / "new.js").write_text("console.log('new')")

    def tearDown(self):
        self.temp.cleanup()

    def test_atomic_release_and_old_assets(self):
        with patch.object(self.updater, "check_deployment"):
            self.updater.activate(self.dist, SHA)
        self.assertEqual(self.updater.current()["current_sha"], SHA)
        self.assertIn(SHA, (self.releases / "current" / "index.html").read_text())
        self.assertEqual((self.releases / "assets" / "old.js").read_text(), "old asset")
        self.assertTrue((self.releases / "assets" / "new.js").is_file())
        self.assertTrue((self.releases / OLD_SHA / "index.html").is_file())

    def test_http_deployment_probe(self):
        handler = partial(QuietStaticHandler, directory=str(self.releases / "current"))
        server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            self.updater.probe_url = "http://127.0.0.1:%s/index.html" % server.server_port
            self.updater.activate(self.dist, SHA)
            self.assertEqual(self.updater.current()["current_sha"], SHA)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_failed_probe_restores_previous_release(self):
        with patch.object(self.updater, "check_deployment", side_effect=module.UpdateError("probe failed")):
            with self.assertRaises(module.UpdateError):
                self.updater.activate(self.dist, SHA)
        self.assertEqual(self.updater.current()["current_sha"], OLD_SHA)
        self.assertEqual((self.releases / "current" / "index.html").read_text(), "old index")

    def test_immutable_collision_keeps_current_release(self):
        (self.releases / "assets" / "new.js").write_text("different old asset")
        with self.assertRaises(module.UpdateError):
            self.updater.activate(self.dist, SHA)
        self.assertEqual(self.updater.current()["current_sha"], OLD_SHA)

    def test_duplicate_apply_reuses_running_job(self):
        finished = threading.Event()
        with patch.object(self.updater, "build", side_effect=lambda: finished.wait(5)) as build:
            first = self.updater.start()
            second = self.updater.start()
            self.assertEqual(first, second)
            finished.set()
        self.assertEqual(build.call_count, 1)

    def test_build_scripts_can_find_the_local_pnpm_shim(self):
        shim = self.updater.bin_dir / "pnpm"
        shim.write_text("#!/bin/sh\nprintf 'local pnpm shim\\n'\n")
        shim.chmod(0o755)
        self.updater.command(["sh", "-c", "pnpm"], self.root)
        self.assertIn("local pnpm shim", self.updater.log_file.read_text())

    def test_build_failure_keeps_current_and_persists_error(self):
        with patch.object(self.updater, "command", side_effect=module.UpdateError("install failed")):
            self.updater.build()
        self.assertEqual(self.updater.job["state"], "failed")
        self.assertIn("install failed", self.updater.job["log"])
        self.assertEqual(self.updater.current()["current_sha"], OLD_SHA)

    def test_restart_marks_interrupted_job_failed(self):
        self.updater.set_job(state="running", step="build")
        restarted = module.Updater(self.root / "state", self.releases, "unused")
        self.assertEqual(restarted.job["state"], "failed")
        self.assertEqual(restarted.current()["current_sha"], OLD_SHA)

    def test_github_failure_preserves_last_known_revision(self):
        result = subprocess.CompletedProcess([], 0, SHA + "\trefs/heads/main\n", "")
        with patch.object(module.time, "monotonic", return_value=10), \
                patch.object(module.subprocess, "run", return_value=result):
            self.assertTrue(self.updater.status()["has_update"])
        with patch.object(module.subprocess, "run", side_effect=subprocess.TimeoutExpired("git", 20)):
            status = self.updater.status(force=True)
        self.assertTrue(status["unreachable"])
        self.assertEqual(status["latest_sha"], SHA)


if __name__ == "__main__":
    unittest.main()

import importlib.util
import io
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


class ReleaseNotesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.updater = module.Updater(self.root / "state", self.root / "releases", "unused")
        self.document = json.loads((Path(__file__).parents[2] / "public/release-notes.json").read_text(encoding="utf-8"))
        self.data = json.dumps(self.document).encode()

    def tearDown(self):
        self.temp.cleanup()

    def test_repository_notes_have_valid_translations(self):
        self.assertTrue(module.Updater.validate_notes(self.document))

    def test_fetches_pinned_commit_and_caches_success(self):
        with patch.object(module, "urlopen", return_value=io.BytesIO(self.data)) as fetch:
            result = self.updater.release_notes(SHA, OLD_SHA)
            self.assertEqual(result["state"], "available")
            self.assertEqual(result["sha"], SHA)
            self.assertEqual(result["releases"], self.document["releases"])
            self.assertIn("/" + SHA + "/public/release-notes.json", fetch.call_args.args[0].full_url)
            self.assertEqual(self.updater.release_notes(SHA, OLD_SHA, force=True), result)
            fetch.assert_called_once()

    def test_current_release_uses_installed_notes_offline(self):
        current = self.root / "releases/current"
        current.mkdir()
        (current / "release-notes.json").write_bytes(self.data)
        module.write_json(current / "ui-update.json", {"source_sha": SHA})
        with patch.object(module, "urlopen") as fetch:
            self.assertEqual(self.updater.release_notes(SHA, SHA)["state"], "available")
            fetch.assert_not_called()

    def test_changed_current_link_does_not_mislabel_local_notes(self):
        current = self.root / "releases/current"
        current.mkdir()
        (current / "release-notes.json").write_bytes(self.data)
        module.write_json(current / "ui-update.json", {"source_sha": OLD_SHA})
        with patch.object(module, "urlopen", side_effect=TimeoutError) as fetch:
            self.assertEqual(self.updater.release_notes(SHA, SHA)["state"], "unavailable")
            fetch.assert_called_once()

    def test_notes_failure_keeps_update_available(self):
        self.updater.latest_sha = SHA
        with patch.object(self.updater, "refresh_latest"), \
                patch.object(self.updater, "current", return_value={"current_sha": OLD_SHA}), \
                patch.object(module, "urlopen", side_effect=TimeoutError):
            status = self.updater.status()
        self.assertTrue(status["has_update"])
        self.assertFalse(status["unreachable"])
        self.assertEqual(status["release_notes"]["state"], "unavailable")

    def test_missing_notes_can_be_retried_manually(self):
        with patch.object(module, "urlopen", side_effect=HTTPError("unused", 404, "missing", {}, None)):
            self.assertEqual(self.updater.release_notes(SHA, OLD_SHA)["state"], "missing")
        with patch.object(module, "urlopen", return_value=io.BytesIO(self.data)) as fetch:
            self.assertEqual(self.updater.release_notes(SHA, OLD_SHA)["state"], "missing")
            fetch.assert_not_called()
            self.assertEqual(self.updater.release_notes(SHA, OLD_SHA, force=True)["state"], "available")

    def test_invalid_oversized_and_unreachable_notes_do_not_break_updates(self):
        for data in (b"invalid JSON", b"{}", b"x" * (module.RELEASE_NOTES_LIMIT + 1),
                     b'{"schema_version":1,"releases":[{"date":"bad"}]}'):
            with self.subTest(data=data[:50]), patch.object(module, "urlopen", return_value=io.BytesIO(data)):
                self.assertEqual(self.updater.release_notes(SHA, OLD_SHA, force=True)["state"], "unavailable")
        with patch.object(module, "urlopen", side_effect=TimeoutError):
            self.assertEqual(self.updater.release_notes(SHA, OLD_SHA, force=True)["state"], "unavailable")

    def test_new_revision_does_not_reuse_previous_notes(self):
        with patch.object(module, "urlopen", return_value=io.BytesIO(self.data)):
            self.updater.release_notes(SHA, OLD_SHA)
        with patch.object(module, "urlopen", side_effect=TimeoutError):
            result = self.updater.release_notes(OLD_SHA, SHA)
        self.assertEqual(result, {"sha": OLD_SHA, "state": "unavailable", "releases": []})

    def test_status_includes_notes_during_github_outage(self):
        with patch.object(self.updater, "refresh_latest"), \
                patch.object(self.updater, "current", return_value={"current_sha": SHA}), \
                patch.object(module, "urlopen", return_value=io.BytesIO(self.data)):
            self.updater.unreachable = True
            status = self.updater.status()
        self.assertTrue(status["unreachable"])
        self.assertEqual(status["release_notes"]["sha"], SHA)
        self.assertEqual(status["release_notes"]["state"], "available")

    def test_invalid_revision_never_requests_a_url(self):
        with patch.object(module, "urlopen") as fetch:
            self.assertEqual(self.updater.release_notes("../main", None)["state"], "unavailable")
            fetch.assert_not_called()


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

    @patch.object(module.Updater, "release_notes", return_value={"state": "unavailable", "releases": []})
    def test_github_failure_preserves_last_known_revision(self, _notes):
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

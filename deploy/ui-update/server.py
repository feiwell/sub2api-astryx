#!/usr/bin/env python3
"""Administrator-only updater for the standalone Astryx frontend (Python 3.11+)."""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import tempfile
import threading
import time
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

REPOSITORY = "https://github.com/feiwell/sub2api-astryx.git"
BRANCH = "main"
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")


def write_json(path, value):
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, path)


class UpdateError(Exception):
    pass


class Updater:
    def __init__(self, state_dir, releases_dir, probe_url):
        self.state_dir = Path(state_dir)
        self.releases_dir = Path(releases_dir)
        self.probe_url = probe_url
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.bin_dir = self.state_dir / "bin"
        self.bin_dir.mkdir(exist_ok=True)
        self.releases_dir.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.latest_sha = None
        self.checked_at = 0
        self.unreachable = False
        self.job_file = self.state_dir / "job.json"
        self.log_file = self.state_dir / "build.log"
        self.job = self.read_json(self.job_file) or {
            "state": "idle", "step": "", "log": "", "started_at": None,
            "finished_at": None, "sha": None,
        }
        if self.job["state"] == "running":
            self.set_job(state="failed", step="interrupted", finished_at=int(time.time()),
                         log="Update service restarted during the previous job. Retry the update.")

    @staticmethod
    def read_json(path):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def set_job(self, **values):
        with self.lock:
            self.job.update(values)
            write_json(self.job_file, self.job)

    def refresh_latest(self, force=False):
        with self.lock:
            if not force and time.monotonic() - self.checked_at < 60:
                return
            try:
                result = subprocess.run(
                    ["git", "ls-remote", "--exit-code", REPOSITORY, "refs/heads/" + BRANCH],
                    capture_output=True, text=True, timeout=20, check=True,
                    env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
                )
                sha = result.stdout.split()[0]
                if not SHA_PATTERN.fullmatch(sha):
                    raise UpdateError("Invalid repository revision")
                self.latest_sha = sha
                self.unreachable = False
            except (OSError, subprocess.SubprocessError, IndexError, UpdateError):
                self.unreachable = True
            self.checked_at = time.monotonic()

    def current(self):
        current = (self.releases_dir / "current").resolve()
        metadata = self.read_json(current / "ui-update.json") or {}
        sha = metadata.get("source_sha")
        if not sha:
            name = current.name
            sha = name if SHA_PATTERN.fullmatch(name) else None
        index = current / "index.html"
        return {
            "current_sha": sha,
            "built_at": metadata.get("built_at"),
            "dist_index_sha": hashlib.sha256(index.read_bytes()).hexdigest() if index.is_file() else None,
        }

    def status(self, force=False):
        self.refresh_latest(force)
        with self.lock:
            current = self.current()
            job = dict(self.job)
            if job["state"] == "running" and self.log_file.exists():
                with self.log_file.open("rb") as log:
                    log.seek(max(0, self.log_file.stat().st_size - 12000))
                    job["log"] = log.read().decode("utf-8", errors="replace")
            return {
                **current, "latest_sha": self.latest_sha,
                "has_update": bool(self.latest_sha and self.latest_sha != current["current_sha"]),
                "job": job, "unreachable": self.unreachable,
            }

    def start(self):
        with self.lock:
            if self.job["state"] == "running":
                return dict(self.job)
            self.log_file.write_text("", encoding="utf-8")
            self.set_job(state="running", step="fetch", log="", started_at=int(time.time()),
                         finished_at=None, sha=None)
            threading.Thread(target=self.build, daemon=True).start()
            return dict(self.job)

    def command(self, args, cwd, timeout=900):
        with self.log_file.open("ab") as log:
            process = subprocess.Popen(
                args, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
                env={**os.environ, "CI": "true", "GIT_TERMINAL_PROMPT": "0",
                     "PATH": str(self.bin_dir) + os.pathsep + os.environ.get("PATH", ""),
                     "COREPACK_ENABLE_DOWNLOAD_PROMPT": "0"},
            )
            try:
                result = process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
                raise UpdateError("Build command timed out") from None
        if result != 0:
            raise UpdateError("Build command failed (exit " + str(result) + ")")

    def check_deployment(self, sha):
        with urlopen(self.probe_url, timeout=10) as response:
            html = response.read(4 * 1024 * 1024).decode("utf-8")
        if 'name="frontend-source-sha" content="' + sha + '"' not in html:
            raise UpdateError("Published HTML did not pass the deployment check")
        asset = re.search(r'src="(/assets/[^"?#]+\.js)"', html)
        if not asset:
            raise UpdateError("Published HTML has no application module")
        origin = urlsplit(self.probe_url)
        asset_url = origin.scheme + "://" + origin.netloc + asset.group(1)
        with urlopen(asset_url, timeout=10) as response:
            if "javascript" not in response.headers.get("Content-Type", ""):
                raise UpdateError("Published application module is unavailable")

    def activate(self, dist, sha):
        if not (dist / "index.html").is_file() or not (dist / "assets").is_dir():
            raise UpdateError("Build output is incomplete")
        html = (dist / "index.html").read_text(encoding="utf-8")
        if "</head>" not in html:
            raise UpdateError("Build output has no HTML head")
        html = html.replace("</head>", '<meta name="frontend-source-sha" content="' + sha + '"></head>')
        (dist / "index.html").write_text(html, encoding="utf-8")
        write_json(dist / "ui-update.json", {
            "source_sha": sha, "repository": REPOSITORY, "branch": BRANCH,
            "built_at": datetime.now(timezone.utc).isoformat(),
        })
        for file in dist.rglob("*"):
            if file.is_symlink():
                raise UpdateError("Build output contains a symbolic link")
        destination = self.releases_dir / (sha + "-" + uuid.uuid4().hex[:8])
        shutil.copytree(dist, destination)
        # Immutable hashed assets remain available to tabs opened before deployment.
        assets = self.releases_dir / "assets"
        assets.mkdir(exist_ok=True)
        for source in (destination / "assets").rglob("*"):
            if not source.is_file():
                continue
            target = assets / source.relative_to(destination / "assets")
            target.parent.mkdir(parents=True, exist_ok=True)
            if target.exists():
                if hashlib.sha256(source.read_bytes()).digest() != hashlib.sha256(target.read_bytes()).digest():
                    raise UpdateError("Immutable asset name collision")
                continue
            temporary = target.with_name(target.name + ".tmp")
            shutil.copyfile(source, temporary)
            temporary.chmod(0o644)
            os.replace(temporary, target)
        for directory, _, files in os.walk(destination):
            Path(directory).chmod(0o755)
            for name in files:
                (Path(directory) / name).chmod(0o644)
        current = self.releases_dir / "current"
        previous = os.readlink(current) if current.is_symlink() else None
        if current.exists() and not current.is_symlink():
            raise UpdateError("Current release must be a symbolic link")
        pending = self.releases_dir / (".current-" + uuid.uuid4().hex)
        pending.symlink_to(destination.name)
        os.replace(pending, current)
        try:
            self.check_deployment(sha)
        except Exception:
            if previous is not None:
                pending.symlink_to(previous)
                os.replace(pending, current)
            else:
                current.unlink()
            raise

    def build(self):
        try:
            self.command(["corepack", "enable", "--install-directory", str(self.bin_dir), "pnpm"],
                         self.state_dir, timeout=30)
            with tempfile.TemporaryDirectory(prefix="build-", dir=self.state_dir) as workspace:
                source = Path(workspace) / "source"
                self.command(["git", "clone", "--depth=1", "--single-branch", "--branch", BRANCH,
                              REPOSITORY, str(source)], self.state_dir, timeout=120)
                sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip()
                if not SHA_PATTERN.fullmatch(sha):
                    raise UpdateError("Invalid source revision")
                self.set_job(sha=sha, step="install")
                self.command(["corepack", "pnpm", "install", "--frozen-lockfile",
                              "--store-dir", str(self.state_dir / "pnpm-store")], source)
                self.set_job(step="build")
                self.command(["corepack", "pnpm", "build"], source)
                self.set_job(step="verify")
                self.command(["corepack", "pnpm", "exec", "astryx", "doctor", "--built", "dist"], source)
                self.set_job(step="publish")
                self.activate(source / "dist", sha)
                self.set_job(state="done", step="done", finished_at=int(time.time()), log="")
                self.checked_at = 0
        except Exception as error:
            tail = ""
            if self.log_file.exists():
                with self.log_file.open("rb") as log:
                    log.seek(max(0, self.log_file.stat().st_size - 10000))
                    tail = log.read().decode("utf-8", errors="replace")
            self.set_job(state="failed", step="failed", finished_at=int(time.time()),
                         log=str(error) + "\n" + tail)


class Handler(BaseHTTPRequestHandler):
    server_version = "AstryxUpdater"

    def log_message(self, format, *args):
        # Request headers, tokens and build output stay out of HTTP access logs.
        pass

    def respond(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        token = self.headers.get("Authorization", "")
        if not token.startswith("Bearer ") or len(token) > 8192:
            self.respond(401, {"message": "Administrator login required"})
            return False
        headers = {"Authorization": token, "Accept": "application/json"}
        # Preserve the same client fingerprint used by backend session binding.
        for name in ("User-Agent", "X-Real-IP", "X-Forwarded-For", "X-Forwarded-Proto", "Host"):
            if self.headers.get(name):
                headers[name] = self.headers[name]
        request = Request(self.server.auth_url, headers=headers)
        try:
            with urlopen(request, timeout=8) as response:
                payload = json.load(response)
            user = payload.get("data") if isinstance(payload, dict) else None
            if not isinstance(user, dict) or user.get("role") != "admin":
                self.respond(403, {"message": "Administrator access required"})
                return False
        except HTTPError as error:
            error.close()
            self.respond(401 if error.code == 401 else 403 if error.code == 403 else 502,
                         {"message": "Administrator authentication failed"})
            return False
        except (URLError, TimeoutError, OSError, ValueError):
            self.respond(502, {"message": "Authentication service unavailable"})
            return False
        return True

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path != "/api/ui-update/status":
            self.respond(404, {"message": "Unknown update endpoint"})
            return
        if self.authorized():
            self.respond(200, self.server.updater.status(force=url.query == "force=1"))

    def do_POST(self):
        # Every response closes POST connections so unconsumed bodies cannot be reused.
        self.close_connection = True
        if self.path != "/api/ui-update/apply":
            self.respond(404, {"message": "Unknown update endpoint"})
            return
        origin = self.headers.get("Origin")
        if origin and origin != self.server.public_origin:
            self.respond(403, {"message": "Invalid request origin"})
            return
        if self.authorized():
            self.respond(202, {"message": "Frontend update started", "job": self.server.updater.start()})


def main():
    server = ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("UI_UPDATE_PORT", "18084"))), Handler)
    server.auth_url = os.environ.get("UI_UPDATE_AUTH_URL", "http://127.0.0.1:8080/api/v1/auth/me")
    server.public_origin = os.environ.get("UI_UPDATE_ORIGIN", "https://xshell.club")
    server.updater = Updater(os.environ.get("UI_UPDATE_STATE", "/var/lib/astryx-ui-update"),
                             os.environ.get("UI_UPDATE_RELEASES", "/data/sub2api-astryx-frontend/releases"),
                             os.environ.get("UI_UPDATE_PROBE", "http://127.0.0.1:18083/index.html"))
    server.serve_forever()


if __name__ == "__main__":
    main()

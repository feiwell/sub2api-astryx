#!/usr/bin/env python3
"""Install the updater into the existing xshell.club nginx/Docker deployment."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import pwd
import shutil
import subprocess

ROOT = Path("/data/sub2api-astryx-frontend")
RELEASES = ROOT / "releases"


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--nginx-site", default="/etc/nginx/sites-enabled/xshell.club")
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise SystemExit("Run this installer with sudo")
    source = Path(__file__).resolve().parent
    site = Path(args.nginx_site).resolve(strict=True)
    compose = ROOT / "compose.yaml"
    web_config = ROOT / "web-nginx.conf"
    mounts = json.loads(run("docker", "inspect", "sub2api-astryx-web", "--format", "{{json .Mounts}}"))
    html_mount = next((mount for mount in mounts if mount["Destination"] in
                       ("/usr/share/nginx/html", "/srv/releases")), None)
    if html_mount is None:
        raise SystemExit("Frontend container has no supported static file mount")
    current = RELEASES / "current"
    if current.is_symlink():
        initial = current.resolve(strict=True)
    else:
        initial = Path(html_mount["Source"]).resolve(strict=True)
    if initial.parent != RELEASES.resolve() or not (initial / "index.html").is_file():
        raise SystemExit("Initial release must be an existing release inside " + str(RELEASES))

    site_text = site.read_text()
    route = """    location ^~ /api/ui-update/ {
        client_max_body_size 1k;
        proxy_pass http://127.0.0.1:18084;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 35s;
        add_header Cache-Control no-store always;
    }
"""
    if "location ^~ /api/ui-update/" not in site_text:
        marker = "    location ~ ^/(?:api"
        if site_text.count(marker) != 1:
            raise SystemExit("Could not identify the production API proxy location")
        site_text = site_text.replace(marker, route + marker, 1)

    compose_text = compose.read_text()
    if ":/srv/releases:ro" not in compose_text:
        old_mount = "./releases/" + initial.name + ":/usr/share/nginx/html:ro"
        if compose_text.count(old_mount) != 1:
            raise SystemExit("Could not identify the production frontend release mount")
        compose_text = compose_text.replace(old_mount, "./releases:/srv/releases:ro")
    config_text = web_config.read_text()
    if "root /srv/releases/current;" not in config_text:
        if config_text.count("root /usr/share/nginx/html;") != 1:
            raise SystemExit("Could not identify the frontend document root")
        config_text = config_text.replace("root /usr/share/nginx/html;", "root /srv/releases/current;")
        marker = "        location ^~ /assets/ {\n"
        if config_text.count(marker) != 1:
            raise SystemExit("Could not identify the immutable assets location")
        config_text = config_text.replace(marker, marker + "            root /srv/releases;\n")

    backup = ROOT / ("before-ui-update-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ"))
    backup.mkdir(mode=0o700)
    for file in (site, compose, web_config):
        shutil.copy2(file, backup / file.name)
    try:
        user = pwd.getpwnam("astryx-updater")
    except KeyError:
        run("useradd", "--system", "--home-dir", "/var/lib/astryx-ui-update", "--shell", "/usr/sbin/nologin",
            "astryx-updater")
        user = pwd.getpwnam("astryx-updater")
    # The frontend root contains root-only deployment files. Allow directory traversal.
    ROOT.chmod(ROOT.stat().st_mode | 0o111)
    RELEASES.chmod(0o755)
    os.chown(RELEASES, user.pw_uid, user.pw_gid)
    if not current.is_symlink():
        current.symlink_to(initial.name)
    assets = RELEASES / "assets"
    shutil.copytree(initial / "assets", assets, dirs_exist_ok=True)
    for directory, _, files in os.walk(assets):
        Path(directory).chmod(0o755)
        os.chown(directory, user.pw_uid, user.pw_gid)
        for name in files:
            file = Path(directory) / name
            file.chmod(0o644)
            os.chown(file, user.pw_uid, user.pw_gid)
    library = Path("/usr/local/lib/astryx-ui-update")
    library.mkdir(mode=0o755, parents=True, exist_ok=True)
    shutil.copy2(source / "server.py", library / "server.py")
    shutil.copy2(source / "astryx-ui-update.service", "/etc/systemd/system/astryx-ui-update.service")
    try:
        site.write_text(site_text)
        compose.write_text(compose_text)
        web_config.write_text(config_text)
        run("nginx", "-t")
        run("docker", "compose", "-f", str(compose), "up", "-d", "--no-deps", "web")
        run("docker", "exec", "sub2api-astryx-web", "nginx", "-t")
        run("systemctl", "daemon-reload")
        run("systemctl", "enable", "--now", "astryx-ui-update.service")
        run("systemctl", "restart", "astryx-ui-update.service")
        run("systemctl", "reload", "nginx")
    except Exception:
        for file in (site, compose, web_config):
            shutil.copy2(backup / file.name, file)
        run("docker", "compose", "-f", str(compose), "up", "-d", "--no-deps", "web")
        run("nginx", "-t")
        run("systemctl", "reload", "nginx")
        raise
    print("Installed astryx-ui-update.service. Deployment backup at " + str(backup))


if __name__ == "__main__":
    main()

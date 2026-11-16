#!/usr/bin/env python3
"""Деплой только в nostradamus-1503.ru/public_html/WeApp — без --delete."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / "deploy" / "beget-ssh.local.env"
SOURCE = ROOT / "public_html"
REMOTE_DIR = "nostradamus-1503.ru/public_html/WeApp"


def load_env(path: Path) -> dict[str, str]:
    cfg: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        cfg[k.strip()] = v.strip()
    return cfg


def ensure_remote_dir(sftp: paramiko.SFTPClient, path: str) -> None:
    parts = path.replace("\\", "/").strip("/").split("/")
    acc = ""
    for part in parts:
        acc = f"{acc}/{part}" if acc else part
        try:
            sftp.stat(acc)
        except OSError:
            sftp.mkdir(acc)


def upload_tree(sftp: paramiko.SFTPClient, local: Path, remote: str) -> int:
    count = 0
    for item in local.rglob("*"):
        rel = item.relative_to(local).as_posix()
        remote_path = f"{remote}/{rel}" if rel != "." else remote
        if item.is_dir():
            try:
                sftp.stat(remote_path)
            except OSError:
                sftp.mkdir(remote_path)
        else:
            ensure_remote_dir(sftp, os.path.dirname(remote_path))
            sftp.put(str(item), remote_path)
            count += 1
    return count


def main() -> int:
    if not ENV_FILE.is_file():
        print("Нет deploy/beget-ssh.local.env", file=sys.stderr)
        return 1
    cfg = load_env(ENV_FILE)
    for key in ("BEGET_SSH_USER", "BEGET_SSH_HOST", "BEGET_SSH_PASSWORD"):
        if not cfg.get(key):
            print(f"Не задан {key}", file=sys.stderr)
            return 1

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        cfg["BEGET_SSH_HOST"],
        username=cfg["BEGET_SSH_USER"],
        password=cfg["BEGET_SSH_PASSWORD"],
        timeout=30,
        allow_agent=False,
        look_for_keys=False,
    )
    sftp = client.open_sftp()
    ensure_remote_dir(sftp, REMOTE_DIR)
    n = upload_tree(sftp, SOURCE, REMOTE_DIR)
    sftp.close()
    client.close()
    print(f"Uploaded {n} files -> {REMOTE_DIR}")
    print("https://nostradamus-1503.ru/WeApp/")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
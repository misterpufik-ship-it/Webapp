#!/usr/bin/env python3
"""
Настройка MySQL для WeApp на BeGet:
- применяет sql/001_schema.sql
- заливает api/config.local.php (только на сервер, не в git)

В deploy/beget-ssh.local.env должны быть:
  BEGET_SSH_USER, BEGET_SSH_HOST, BEGET_SSH_PASSWORD
  BEGET_MYSQL_HOST=localhost
  BEGET_MYSQL_DB=mrpuffch_weapp
  BEGET_MYSQL_USER=mrpuffch_weapp
  BEGET_MYSQL_PASSWORD=...
"""
from __future__ import annotations

import re
import sys
import tempfile
from pathlib import Path

import paramiko

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / "deploy" / "beget-ssh.local.env"
SCHEMA = ROOT / "sql" / "001_schema.sql"
REMOTE_WEB = "nostradamus-1503.ru/public_html/WeApp"
REMOTE_CONFIG = f"{REMOTE_WEB}/api/config.local.php"


def load_env(path: Path) -> dict[str, str]:
    cfg: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        cfg[k.strip()] = v.strip()
    return cfg


def php_config_content(cfg: dict[str, str]) -> str:
    db_host = cfg.get("BEGET_MYSQL_HOST", "localhost")
    db_name = cfg["BEGET_MYSQL_DB"]
    db_user = cfg["BEGET_MYSQL_USER"]
    db_pass = cfg["BEGET_MYSQL_PASSWORD"]
    save_token = cfg.get("BEGET_SAVE_TOKEN", "")
    esc = lambda s: s.replace("\\", "\\\\").replace("'", "\\'")
    return f"""<?php
declare(strict_types=1);
return [
    'db_host' => '{esc(db_host)}',
    'db_name' => '{esc(db_name)}',
    'db_user' => '{esc(db_user)}',
    'db_pass' => '{esc(db_pass)}',
    'save_token' => '{esc(save_token)}',
];
"""


def run_ssh(ssh: paramiko.SSHClient, cmd: str) -> tuple[int, str, str]:
    stdin, stdout, stderr = ssh.exec_command(cmd)
    code = stdout.channel.recv_exit_status()
    return code, stdout.read().decode(), stderr.read().decode()


def main() -> int:
    if not ENV_FILE.is_file():
        print(f"Нет {ENV_FILE}", file=sys.stderr)
        return 1
    cfg = load_env(ENV_FILE)
    for key in ("BEGET_SSH_USER", "BEGET_SSH_HOST", "BEGET_SSH_PASSWORD"):
        if not cfg.get(key):
            print(f"Не задан {key}", file=sys.stderr)
            return 1
    for key in ("BEGET_MYSQL_DB", "BEGET_MYSQL_USER", "BEGET_MYSQL_PASSWORD"):
        if not cfg.get(key):
            print(
                f"Не задан {key} в beget-ssh.local.env\n"
                "Создай БД в панели BeGet → MySQL и добавь строки (см. beget-ssh.local.env.example).",
                file=sys.stderr,
            )
            return 1

    if not SCHEMA.is_file():
        print("Нет sql/001_schema.sql", file=sys.stderr)
        return 1

    db_host = cfg.get("BEGET_MYSQL_HOST", "localhost")
    db_name = cfg["BEGET_MYSQL_DB"]
    db_user = cfg["BEGET_MYSQL_USER"]
    db_pass = cfg["BEGET_MYSQL_PASSWORD"]

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
    with sftp.file(SCHEMA.name, "w") as rf:
        rf.write(SCHEMA.read_text(encoding="utf-8"))
    sftp.close()

    schema2 = ROOT / "sql" / "002_alter_legacy.sql"
    remote_sql = SCHEMA.name
    # Пароль в env, не в argv — через heredoc-файл на сервере (короткий)
    pass_quoted = db_pass.replace("'", "'\"'\"'")
    mysql_cmd = (
        f"MYSQL_PWD='{pass_quoted}' mysql -h {db_host} -u {db_user} {db_name} < {remote_sql} 2>&1"
    )
    code, out, err = run_ssh(client, mysql_cmd)
    run_ssh(client, f"rm -f {remote_sql}")
    if code != 0:
        print("Ошибка применения схемы:", out or err, file=sys.stderr)
        client.close()
        return 1
    print("SQL schema OK")

    if schema2.is_file():
        sftp = client.open_sftp()
        with sftp.file("002_alter_legacy.sql", "w") as rf:
            rf.write(schema2.read_text(encoding="utf-8"))
        sftp.close()
        mysql_cmd2 = (
            f"MYSQL_PWD='{pass_quoted}' mysql -h {db_host} -u {db_user} {db_name} < 002_alter_legacy.sql 2>&1"
        )
        code2, out2, err2 = run_ssh(client, mysql_cmd2)
        run_ssh(client, "rm -f 002_alter_legacy.sql")
        if code2 != 0:
            print("Предупреждение 002_alter:", out2 or err2)

    php_body = php_config_content(cfg)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".php", delete=False) as tf:
        tf.write(php_body)
        local_cfg = Path(tf.name)

    sftp = client.open_sftp()
    try:
        sftp.put(str(local_cfg), REMOTE_CONFIG)
    finally:
        sftp.close()
        local_cfg.unlink(missing_ok=True)

    print(f"Загружен {REMOTE_CONFIG}")

    code, out, err = run_ssh(
        client,
        f"php -r \"require '{REMOTE_WEB}/api/health.php';\" 2>&1 || curl -s https://nostradamus-1503.ru/WeApp/api/health.php",
    )
    client.close()

    print("Проверка: https://nostradamus-1503.ru/WeApp/api/health.php")
    print("Готово.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
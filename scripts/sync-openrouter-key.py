from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_CANDIDATES = [
    Path(r"C:\Users\mrpuf\OneDrive\Рабочий стол\Приложение для пар\.env"),
    ROOT.parent / "Приложение для пар" / ".env",
    ROOT / ".env",
]
DEST = ROOT / "public_html" / "api" / "openrouter.local.php"


def parse_env(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        out[key.strip()] = value.strip().strip('"').strip("'")
    return out


def main() -> int:
    env: dict[str, str] = {}
    source = None
    for path in ENV_CANDIDATES:
        parsed = parse_env(path)
        if parsed.get("OPENROUTER_API_KEY"):
            env = parsed
            source = path
            break
        if parsed and source is None:
            env = parsed
            source = path

    key = env.get("OPENROUTER_API_KEY", "")
    model = env.get("OPENROUTER_MODEL") or "deepseek/deepseek-chat"
    DEST.write_text(
        "<?php\n"
        "declare(strict_types=1);\n"
        "return [\n"
        f"    'openrouter_api_key' => {json.dumps(key)},\n"
        f"    'openrouter_model' => {json.dumps(model)},\n"
        "    'openrouter_url' => 'https://openrouter.ai/api/v1/chat/completions',\n"
        "    'openrouter_referer' => 'https://nostradamus-1503.ru/WeApp/',\n"
        "    'openrouter_title' => 'Perevodchik chuvstv',\n"
        "];\n",
        encoding="utf-8",
    )
    print(f"source={'none' if source is None else source.name}")
    print("key_status=" + ("set" if len(key) >= 8 else "empty"))
    print(f"wrote={DEST.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

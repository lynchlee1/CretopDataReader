import json
from pathlib import Path

APP_DIR = Path.home() / ".weekly_mezz"
CONFIG_PATH = APP_DIR / "config.json"


def ensure_app_dir() -> Path:
    APP_DIR.mkdir(parents=True, exist_ok=True)
    return APP_DIR


def load_config() -> dict:
    if not CONFIG_PATH.exists():
        return {}
    try:
        return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_config(config: dict) -> None:
    ensure_app_dir()
    CONFIG_PATH.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def get_config_value(name: str, default=None):
    return load_config().get(name, default)


def set_config_value(name: str, value) -> None:
    config = load_config()
    config[name] = value
    save_config(config)

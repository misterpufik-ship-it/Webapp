# Webapp — Переводчик чувств (анкета)

Публичный путь: **https://nostradamus-1503.ru/WeApp/**

Отдельный репозиторий от «Приложение для пар». Деплой только в `WeApp/` на BeGet, без затрагивания остального Nostradamus.

## Деплой

Заполни `deploy/beget-ssh.local.env` (в gitignore), затем:

```powershell
python scripts/deploy-beget-password.py
```

## MySQL (пары и анкеты)

1. **BeGet → MySQL** — создать БД и пользователя (имена обычно `mrpuffch_weapp`).
2. В `deploy/beget-ssh.local.env` добавить `BEGET_MYSQL_*` (см. `beget-ssh.local.env.example`).
3. Применить схему и залить `config.local.php` на сервер:

```powershell
python scripts/setup-mysql-beget.py
```

4. Проверка: https://nostradamus-1503.ru/WeApp/api/health.php  
   Ожидается: `"schema_ready": true`, `"pair_storage": "mysql"`.

Таблицы: `couples` (код пары, профили owner/partner), `questionnaire_submissions` (история сохранений).

Без MySQL анкета работает в браузере, **пара** — через файлы в `api/storage/pairs/` (резерв).

## GitHub

`https://github.com/misterpufik-ship-it/Webapp`
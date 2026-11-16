# Webapp — Переводчик чувств (анкета)

Публичный путь: **https://nostradamus-1503.ru/webapp/**

Отдельный репозиторий от «Приложение для пар». Деплой только эту папку на BeGet (через VPS), не смешивать с основным rsync Nostradamus без `--exclude webapp`.

## Деплой

Заполни `deploy/beget-ssh.local.env` (в gitignore), затем:

```powershell
python scripts/deploy-beget-password.py
```

Через VPS (если доступен): `.\scripts\deploy-beget.ps1`

## База данных (BeGet, опционально)

1. Панель BeGet → MySQL → создать БД `mrpuffch_webapp` и пользователя.
2. phpMyAdmin → выполнить [`sql/001_schema.sql`](sql/001_schema.sql).
3. На сервере: `public_html/api/config.local.php` по образцу [`config.example.php`](public_html/api/config.example.php).

Без `config.local.php` сайт работает (localStorage + скачивание JSON); кнопка «Сохранить на сервер» вернёт понятную ошибку.

## GitHub

`https://github.com/misterpufik-ship-it/Webapp`
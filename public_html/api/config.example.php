<?php
declare(strict_types=1);
/**
 * Скопировать на BeGet как config.local.php (не в git).
 * Создайте БД и пользователя в панели BeGet, затем выполните sql/001_schema.sql
 */
return [
    'db_host' => 'localhost',
    'db_name' => 'mrpuffch_webapp',
    'db_user' => 'mrpuffch_webapp',
    'db_pass' => 'ЗАМЕНИТЬ',
    'save_token' => '', // опционально: секрет в заголовке X-Save-Token
];
<?php
declare(strict_types=1);
/**
 * Скопировать на BeGet как config.local.php (не в git).
 * Создайте БД и пользователя в панели BeGet, затем выполните sql/001_schema.sql
 */
return [
    'db_host' => 'localhost',
    'db_name' => 'mrpuffch_weapp',
    'db_user' => 'mrpuffch_weapp',
    'db_pass' => 'ЗАМЕНИТЬ',
    'save_token' => '', // опционально: секрет в заголовке X-Save-Token
    'openai_api_key' => '', // опционально: живой LLM для переводчика
    'openai_model' => 'gpt-4.1-mini',
];
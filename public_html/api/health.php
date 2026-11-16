<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/pair_storage.php';
require_once __DIR__ . '/translate_engine.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$config = app_db_config();
$db = app_db();

echo json_encode([
    'ok' => true,
    'mysql_configured' => $config !== null,
    'mysql_connected' => $db !== null,
    'schema_ready' => app_db_ready(),
    'pair_storage' => pair_storage_backend(),
    'llm' => app_llm_key_configured() ? 'openrouter-deepseek' : 'local',
], JSON_UNESCAPED_UNICODE);
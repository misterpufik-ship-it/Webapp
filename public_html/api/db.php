<?php
declare(strict_types=1);

/**
 * Подключение к MySQL (config.local.php). Без конфига — null.
 */
function app_db_config(): ?array
{
    $config = require __DIR__ . '/config.php';
    return is_array($config) ? $config : null;
}

function app_db(): ?mysqli
{
    static $mysqli = null;
    static $tried = false;

    if ($tried) {
        return $mysqli;
    }
    $tried = true;

    $config = app_db_config();
    if ($config === null) {
        return null;
    }

    $mysqli = @new mysqli(
        (string) ($config['db_host'] ?? 'localhost'),
        (string) ($config['db_user'] ?? ''),
        (string) ($config['db_pass'] ?? ''),
        (string) ($config['db_name'] ?? ''),
    );

    if ($mysqli->connect_errno) {
        $mysqli = null;
        return null;
    }

    $mysqli->set_charset('utf8mb4');
    return $mysqli;
}

function app_db_ready(): bool
{
    $db = app_db();
    if ($db === null) {
        return false;
    }
    $res = $db->query("SHOW TABLES LIKE 'couples'");
    return $res instanceof mysqli_result && $res->num_rows > 0;
}
<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Save-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method']);
    exit;
}

$config = require __DIR__ . '/config.php';
if ($config === null) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'db_not_configured']);
    exit;
}

$token = (string) ($config['save_token'] ?? '');
if ($token !== '') {
    $hdr = $_SERVER['HTTP_X_SAVE_TOKEN'] ?? '';
    if (!hash_equals($token, (string) $hdr)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'forbidden']);
        exit;
    }
}

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'empty']);
    exit;
}

$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'invalid_json']);
    exit;
}

$displayName = trim((string) ($data['display_name'] ?? ''));
if ($displayName === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'no_name']);
    exit;
}

$questionnaire = $data['questionnaire'] ?? null;
if (!is_array($questionnaire)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'no_questionnaire']);
    exit;
}

$json = json_encode($data, JSON_UNESCAPED_UNICODE);
if ($json === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'encode']);
    exit;
}

$mysqli = new mysqli(
    (string) $config['db_host'],
    (string) $config['db_user'],
    (string) $config['db_pass'],
    (string) $config['db_name'],
);
if ($mysqli->connect_errno) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'db_connect']);
    exit;
}
$mysqli->set_charset('utf8mb4');

$stmt = $mysqli->prepare(
    'INSERT INTO questionnaire_submissions (display_name, payload_json, ip_hash) VALUES (?, ?, ?)'
);
$ipHash = hash('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
$stmt->bind_param('sss', $displayName, $json, $ipHash);
$ok = $stmt->execute();
if (!$ok) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'insert']);
    exit;
}

$id = $stmt->insert_id;
$stmt->close();
$mysqli->close();

echo json_encode(['ok' => true, 'id' => $id], JSON_UNESCAPED_UNICODE);
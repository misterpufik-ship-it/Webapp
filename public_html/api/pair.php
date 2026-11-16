<?php
declare(strict_types=1);

require_once __DIR__ . '/pair_storage.php';
require_once __DIR__ . '/dialog_storage.php';
require_once __DIR__ . '/translate_engine.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function normalize_code(string $code): ?string
{
    $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $code) ?? '');
    if (strlen($code) < 4 || strlen($code) > 12) {
        return null;
    }
    return $code;
}

function random_code(): string
{
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $out = '';
    for ($i = 0; $i < 6; $i++) {
        $out .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return $out;
}

if (!app_db_ready() && !pair_ensure_file_dir()) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'storage'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $code = normalize_code((string) ($_GET['code'] ?? ''));
    if ($code === null) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'bad_code'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $data = pair_load($code);
    if ($data === null) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'not_found'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['ok' => true, 'pair' => pair_public_status($data)], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method'], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents('php://input');
$body = json_decode($raw ?: '', true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'invalid_json'], JSON_UNESCAPED_UNICODE);
    exit;
}

$action = (string) ($body['action'] ?? '');

if ($action === 'create') {
    $displayName = trim((string) ($body['display_name'] ?? ''));
    if ($displayName === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'no_name'], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $requested = isset($body['code']) ? normalize_code((string) $body['code']) : null;

    for ($try = 0; $try < 8; $try++) {
        $code = $requested ?? random_code();
        if (pair_mysql_code_taken($code)) {
            if ($requested !== null) {
                http_response_code(409);
                echo json_encode(['ok' => false, 'error' => 'code_taken'], JSON_UNESCAPED_UNICODE);
                exit;
            }
            continue;
        }

        $data = pair_create_record($code, $displayName);
        if ($data !== null) {
            echo json_encode(['ok' => true, 'pair' => pair_public_status($data)], JSON_UNESCAPED_UNICODE);
            exit;
        }
        break;
    }

    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'create_failed'], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'join') {
    $code = normalize_code((string) ($body['code'] ?? ''));
    $displayName = trim((string) ($body['display_name'] ?? ''));
    if ($code === null || $displayName === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'bad_request'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $data = pair_load($code);
    if ($data === null) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'not_found'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (!empty($data['partner_name']) && strcasecmp((string) $data['partner_name'], $displayName) !== 0) {
        http_response_code(409);
        echo json_encode(['ok' => false, 'error' => 'partner_taken'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $data['partner_name'] = $displayName;
    $data['updated_at'] = gmdate('c');
    if (!pair_save($data)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'write_failed'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['ok' => true, 'pair' => pair_public_status($data)], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'save_profile') {
    $code = normalize_code((string) ($body['code'] ?? ''));
    $role = (string) ($body['role'] ?? '');
    $displayName = trim((string) ($body['display_name'] ?? ''));
    $profile = $body['profile'] ?? null;
    if ($code === null || !in_array($role, ['owner', 'partner'], true) || !is_array($profile)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'bad_request'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $data = pair_load($code);
    if ($data === null) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'not_found'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($role === 'owner') {
        if ($displayName !== '') {
            $data['owner_name'] = $displayName;
        }
        $data['owner_profile'] = $profile;
    } else {
        if ($displayName !== '') {
            $data['partner_name'] = $displayName;
        }
        $data['partner_profile'] = $profile;
    }
    $data['updated_at'] = gmdate('c');
    if (!pair_save($data)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'write_failed'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['ok' => true, 'pair' => pair_public_status($data)], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'translate_context') {
    $code = normalize_code((string) ($body['code'] ?? ''));
    $role = (string) ($body['role'] ?? '');
    if ($code === null || !in_array($role, ['owner', 'partner'], true)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'bad_request'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $data = pair_load($code);
    if ($data === null) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'not_found'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $other = $role === 'owner' ? ($data['partner_profile'] ?? null) : ($data['owner_profile'] ?? null);
    echo json_encode([
        'ok' => true,
        'pair' => pair_public_status($data),
        'recipient' => translate_sanitize_recipient(is_array($other) ? $other : null),
        'dialog' => dialog_load($code, $role),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'save_turn') {
    $code = normalize_code((string) ($body['code'] ?? ''));
    $role = (string) ($body['role'] ?? '');
    $turn = $body['turn'] ?? null;
    if ($code === null || !in_array($role, ['owner', 'partner'], true) || !is_array($turn)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'bad_request'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $safeTurn = [
        'draft' => mb_substr(trim((string) ($turn['draft'] ?? '')), 0, 2000),
        'translated' => mb_substr(trim((string) ($turn['translated'] ?? '')), 0, 2000),
        'emotion' => mb_substr((string) ($turn['emotion'] ?? ''), 0, 200),
        'nick' => mb_substr((string) ($turn['nick'] ?? ''), 0, 80),
    ];
    $turns = dialog_append($code, $role, $safeTurn);
    echo json_encode(['ok' => true, 'dialog' => $turns], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'translate') {
    $code = normalize_code((string) ($body['code'] ?? ''));
    $role = (string) ($body['role'] ?? '');
    $draft = trim((string) ($body['draft'] ?? ''));
    $clarify = trim((string) ($body['clarify'] ?? ''));
    if ($code === null || !in_array($role, ['owner', 'partner'], true) || $draft === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'bad_request'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $data = pair_load($code);
    if ($data === null) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'not_found'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $sender = $role === 'owner' ? ($data['owner_profile'] ?? null) : ($data['partner_profile'] ?? null);
    $recipientRaw = $role === 'owner' ? ($data['partner_profile'] ?? null) : ($data['owner_profile'] ?? null);
    $recipient = translate_sanitize_recipient(is_array($recipientRaw) ? $recipientRaw : null);
    $history = dialog_load($code, $role);
    $llm = translate_openai_if_possible($draft, is_array($sender) ? $sender : null, $recipient, $history, $clarify);
    $result = $llm ?? translate_feelings($draft, is_array($sender) ? $sender : null, $recipient, $history, $clarify);
    echo json_encode(['ok' => true, 'result' => $result, 'engine' => $llm ? 'openai' : 'local'], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'unknown_action'], JSON_UNESCAPED_UNICODE);
<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$storageDir = __DIR__ . '/storage/pairs';
if (!is_dir($storageDir) && !mkdir($storageDir, 0755, true) && !is_dir($storageDir)) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'storage'], JSON_UNESCAPED_UNICODE);
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

function pair_path(string $storageDir, string $code): string
{
    return $storageDir . '/' . $code . '.json';
}

function read_pair(string $path): ?array
{
    if (!is_file($path)) {
        return null;
    }
    $raw = file_get_contents($path);
    if ($raw === false) {
        return null;
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function write_pair(string $path, array $data): bool
{
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false) {
        return false;
    }
    return file_put_contents($path, $json, LOCK_EX) !== false;
}

function public_status(array $data): array
{
    return [
        'code' => $data['code'] ?? '',
        'owner_name' => $data['owner_name'] ?? null,
        'partner_name' => $data['partner_name'] ?? null,
        'owner_has_profile' => !empty($data['owner_profile']),
        'partner_has_profile' => !empty($data['partner_profile']),
        'paired' => !empty($data['owner_profile']) && !empty($data['partner_profile']),
        'created_at' => $data['created_at'] ?? null,
        'updated_at' => $data['updated_at'] ?? null,
    ];
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

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $code = normalize_code((string) ($_GET['code'] ?? ''));
    if ($code === null) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'bad_code'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $data = read_pair(pair_path($storageDir, $code));
    if ($data === null) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'not_found'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['ok' => true, 'pair' => public_status($data)], JSON_UNESCAPED_UNICODE);
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
    $now = gmdate('c');

    for ($try = 0; $try < 8; $try++) {
        $code = $requested ?? random_code();
        $path = pair_path($storageDir, $code);
        if (is_file($path) && $requested === null) {
            continue;
        }
        if (is_file($path) && $requested !== null) {
            http_response_code(409);
            echo json_encode(['ok' => false, 'error' => 'code_taken'], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $data = [
            'code' => $code,
            'created_at' => $now,
            'updated_at' => $now,
            'owner_name' => $displayName,
            'partner_name' => null,
            'owner_profile' => null,
            'partner_profile' => null,
        ];
        if (write_pair($path, $data)) {
            echo json_encode(['ok' => true, 'pair' => public_status($data)], JSON_UNESCAPED_UNICODE);
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
    $path = pair_path($storageDir, $code);
    $data = read_pair($path);
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
    if (!write_pair($path, $data)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'write_failed'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['ok' => true, 'pair' => public_status($data)], JSON_UNESCAPED_UNICODE);
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
    $path = pair_path($storageDir, $code);
    $data = read_pair($path);
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
    if (!write_pair($path, $data)) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'write_failed'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    echo json_encode(['ok' => true, 'pair' => public_status($data)], JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(400);
echo json_encode(['ok' => false, 'error' => 'unknown_action'], JSON_UNESCAPED_UNICODE);
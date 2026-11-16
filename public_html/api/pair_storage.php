<?php
declare(strict_types=1);

require_once __DIR__ . '/db.php';

function pair_storage_dir(): string
{
    return __DIR__ . '/storage/pairs';
}

function pair_ensure_file_dir(): bool
{
    $dir = pair_storage_dir();
    return is_dir($dir) || mkdir($dir, 0755, true);
}

function pair_file_path(string $code): string
{
    return pair_storage_dir() . '/' . $code . '.json';
}

function pair_row_to_state(array $row): array
{
    $ownerProfile = $row['owner_profile_json'] ?? null;
    $partnerProfile = $row['partner_profile_json'] ?? null;

    if (is_string($ownerProfile)) {
        $ownerProfile = json_decode($ownerProfile, true);
    }
    if (is_string($partnerProfile)) {
        $partnerProfile = json_decode($partnerProfile, true);
    }

    $created = $row['created_at'] ?? null;
    $updated = $row['updated_at'] ?? null;
    if ($created instanceof DateTimeInterface) {
        $created = $created->format('c');
    }
    if ($updated instanceof DateTimeInterface) {
        $updated = $updated->format('c');
    }

    return [
        'code' => (string) ($row['invite_code'] ?? $row['code'] ?? ''),
        'created_at' => $created,
        'updated_at' => $updated,
        'owner_name' => $row['owner_name'] ?? null,
        'partner_name' => $row['partner_name'] ?? null,
        'owner_profile' => is_array($ownerProfile) ? $ownerProfile : null,
        'partner_profile' => is_array($partnerProfile) ? $partnerProfile : null,
    ];
}

function pair_public_status(array $data): array
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
        'storage' => pair_storage_backend(),
    ];
}

function pair_storage_backend(): string
{
    return app_db_ready() ? 'mysql' : 'file';
}

function pair_load(string $code): ?array
{
    if (app_db_ready()) {
        $db = app_db();
        if ($db === null) {
            return null;
        }
        $stmt = $db->prepare('SELECT invite_code, owner_name, partner_name, owner_profile_json, partner_profile_json, created_at, updated_at FROM couples WHERE invite_code = ? LIMIT 1');
        if ($stmt === false) {
            return null;
        }
        $stmt->bind_param('s', $code);
        $stmt->execute();
        $res = $stmt->get_result();
        $row = $res?->fetch_assoc();
        $stmt->close();
        if (!is_array($row)) {
            return null;
        }
        return pair_row_to_state($row);
    }

    $path = pair_file_path($code);
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

function pair_save(array $data): bool
{
    if (app_db_ready()) {
        $db = app_db();
        if ($db === null) {
            return false;
        }
        $code = (string) ($data['code'] ?? '');
        $ownerName = $data['owner_name'] ?? null;
        $partnerName = $data['partner_name'] ?? null;
        $ownerJson = isset($data['owner_profile']) ? json_encode($data['owner_profile'], JSON_UNESCAPED_UNICODE) : null;
        $partnerJson = isset($data['partner_profile']) ? json_encode($data['partner_profile'], JSON_UNESCAPED_UNICODE) : null;

        $stmt = $db->prepare(
            'INSERT INTO couples (invite_code, owner_name, partner_name, owner_profile_json, partner_profile_json)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               owner_name = COALESCE(VALUES(owner_name), owner_name),
               partner_name = COALESCE(VALUES(partner_name), partner_name),
               owner_profile_json = COALESCE(VALUES(owner_profile_json), owner_profile_json),
               partner_profile_json = COALESCE(VALUES(partner_profile_json), partner_profile_json),
               updated_at = CURRENT_TIMESTAMP',
        );
        if ($stmt === false) {
            return false;
        }
        $stmt->bind_param('sssss', $code, $ownerName, $partnerName, $ownerJson, $partnerJson);
        $ok = $stmt->execute();
        $stmt->close();
        return $ok;
    }

    if (!pair_ensure_file_dir()) {
        return false;
    }
    $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false) {
        return false;
    }
    return file_put_contents(pair_file_path((string) $data['code']), $json, LOCK_EX) !== false;
}

function pair_exists(string $code): bool
{
    return pair_load($code) !== null;
}

function pair_create_record(string $code, string $ownerName): ?array
{
    $now = gmdate('c');
    $data = [
        'code' => $code,
        'created_at' => $now,
        'updated_at' => $now,
        'owner_name' => $ownerName,
        'partner_name' => null,
        'owner_profile' => null,
        'partner_profile' => null,
    ];
    if (!pair_save($data)) {
        return null;
    }
    return pair_load($code) ?? $data;
}

function pair_mysql_code_taken(string $code): bool
{
    if (!app_db_ready()) {
        return is_file(pair_file_path($code));
    }
    $db = app_db();
    if ($db === null) {
        return false;
    }
    $stmt = $db->prepare('SELECT 1 FROM couples WHERE invite_code = ? LIMIT 1');
    if ($stmt === false) {
        return true;
    }
    $stmt->bind_param('s', $code);
    $stmt->execute();
    $stmt->store_result();
    $exists = $stmt->num_rows > 0;
    $stmt->close();
    return $exists;
}
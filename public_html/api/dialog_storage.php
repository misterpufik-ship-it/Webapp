<?php
declare(strict_types=1);

function dialog_storage_dir(): string
{
    return __DIR__ . '/storage/dialogs';
}

function dialog_ensure_dir(): bool
{
    $dir = dialog_storage_dir();
    if (is_dir($dir)) {
        return true;
    }
    return mkdir($dir, 0755, true);
}

function dialog_file_path(string $code, string $role): string
{
    $safeCode = preg_replace('/[^A-Z0-9]/', '', strtoupper($code)) ?? '';
    $safeRole = $role === 'partner' ? 'partner' : 'owner';
    return dialog_storage_dir() . '/' . $safeCode . '_' . $safeRole . '.json';
}

function dialog_load(string $code, string $role): array
{
    $path = dialog_file_path($code, $role);
    if (!is_file($path)) {
        return [];
    }
    $raw = file_get_contents($path);
    if ($raw === false) {
        return [];
    }
    $data = json_decode($raw, true);
    return is_array($data['turns'] ?? null) ? $data['turns'] : [];
}

function dialog_save(string $code, string $role, array $turns): bool
{
    if (!dialog_ensure_dir()) {
        return false;
    }
    $payload = [
        'turns' => array_slice($turns, -40),
        'updated_at' => gmdate('c'),
    ];
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if ($json === false) {
        return false;
    }
    return file_put_contents(dialog_file_path($code, $role), $json, LOCK_EX) !== false;
}

function dialog_append(string $code, string $role, array $turn): array
{
    $turns = dialog_load($code, $role);
    $turn['id'] = $turn['id'] ?? bin2hex(random_bytes(8));
    $turn['at'] = $turn['at'] ?? gmdate('c');
    $turn['role'] = $role;
    $turns[] = $turn;
    dialog_save($code, $role, $turns);
    return $turns;
}

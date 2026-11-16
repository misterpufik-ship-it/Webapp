<?php
declare(strict_types=1);

$local = __DIR__ . '/config.local.php';
if (!is_file($local)) {
    return null;
}
return require $local;
<?php
// Ejecutar solo por CLI o con token secreto
if (php_sapi_name() !== 'cli' && ($_GET['token'] ?? '') !== 'FIAD_CRON_2026') {
    http_response_code(403);
    exit('Acceso denegado');
}

date_default_timezone_set('America/Tijuana');

$url = 'https://fiad.edupage.org/timetable/server/regulartt.js?__func=regularttGetData';
$payload = json_encode([
    '__args' => [null, '16'],
    '__gsh'  => '00000000'
]);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $payload,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json; charset=UTF-8',
        'Referer: https://fiad.edupage.org/timetable/view.php?num=16'
    ],
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_TIMEOUT        => 25
]);

$response = curl_exec($ch);
curl_close($ch);

if ($response && strpos($response, 'dbiAccessorRes') !== false) {
    $cacheDir = __DIR__ . '/../cache/';
    if (!is_dir($cacheDir)) mkdir($cacheDir, 0755, true);

    file_put_contents($cacheDir . 'edupage_fiad_16.json', $response, LOCK_EX);
    file_put_contents($cacheDir . 'edupage_fiad_16.meta', date('Y-m-d_H:i'), LOCK_EX);
    echo "OK [" . date('Y-m-d H:i:s') . "]\n";
} else {
    echo "ERROR [" . date('Y-m-d H:i:s') . "]\n";
}
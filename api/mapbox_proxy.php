<?php
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// 1. Obtención segura del Token desde variables de entorno
$mapboxToken = getenv('MAPBOX_ACCESS_TOKEN');

// Fallback opcional: Cargar desde un archivo de configuración no rastreado si getenv no está definido
if (!$mapboxToken && file_exists(__DIR__ . '/config.local.php')) {
    $config = require __DIR__ . '/config.local.php';
    $mapboxToken = $config['MAPBOX_ACCESS_TOKEN'] ?? null;
}

if (!$mapboxToken) {
    http_response_code(500);
    echo json_encode(['error' => 'Configuración de servidor incompleta: Token no disponible']);
    exit();
}

// Validar coordenadas
function validarCoordenadas($coordinates) {
    if (empty($coordinates)) {
        return false;
    }
    
    if (strlen($coordinates) > 500) {
        return false;
    }
    
    if (!preg_match('/^[-0-9.,;]+$/', $coordinates)) {
        return false;
    }
    
    $waypoints = explode(';', $coordinates);
    
    if (count($waypoints) > 25) {
        return false;
    }
    
    foreach ($waypoints as $waypoint) {
        $coords = explode(',', $waypoint);
        
        if (count($coords) !== 2) {
            return false;
        }
        
        $lng = floatval($coords[0]);
        $lat = floatval($coords[1]);
        
        if ($lng < -180 || $lng > 180 || $lat < -90 || $lat > 90) {
            return false;
        }
    }
    
    return true;
}

// Validar perfil
function validarPerfil($profile) {
    $perfilesPermitidos = [
        'mapbox/driving',
        'mapbox/driving-traffic',
        'mapbox/walking',
        'mapbox/cycling'
    ];
    
    return in_array($profile, $perfilesPermitidos);
}

function validarIdioma($language) {
    $idiomasPermitidos = ['es', 'en', 'fr', 'de', 'it', 'pt', 'ru', 'zh', 'ja', 'ar'];
    
    return in_array($language, $idiomasPermitidos) && preg_match('/^[a-z]{2}$/', $language);
}

// Obtener y sanitizar los parámetros
$coordinates = isset($_GET['coordinates']) ? trim($_GET['coordinates']) : null;
$profile = isset($_GET['profile']) ? trim($_GET['profile']) : 'mapbox/walking';
$language = isset($_GET['language']) ? trim($_GET['language']) : 'es';
$alternatives = isset($_GET['alternatives']) ? trim($_GET['alternatives']) : 'false';

if (!$coordinates || !validarCoordenadas($coordinates)) {
    http_response_code(400);
    echo json_encode(['error' => 'Coordenadas inválidas o faltantes']);
    exit();
}

if (!validarPerfil($profile)) {
    http_response_code(400);
    echo json_encode(['error' => 'Perfil de ruta inválido']);
    exit();
}

if (!validarIdioma($language)) {
    http_response_code(400);
    echo json_encode(['error' => 'Código de idioma inválido']);
    exit();
}

if ($alternatives !== 'true' && $alternatives !== 'false') {
    $alternatives = 'false';
}

$url = "https://api.mapbox.com/directions/v5/{$profile}/{$coordinates}";
$url .= "?access_token={$mapboxToken}";
$url .= "&language={$language}";
$url .= "&alternatives={$alternatives}";
$url .= "&geometries=geojson";
$url .= "&overview=full";
$url .= "&steps=true";

try {
    $ch = curl_init();
    
    if (!$ch) {
        throw new Exception('No se pudo inicializar cURL');
    }
    
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    // 2. Seguridad SSL activada
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 3);

    $response = curl_exec($ch);
    
    if ($response === false) {
        $error = curl_error($ch);
        $errno = curl_errno($ch);
        curl_close($ch);
        
        http_response_code(503);
        echo json_encode([
            'error' => 'Error de conexión con Mapbox',
            'details' => $error,
            'code' => $errno
        ]);
        exit();
    }
    
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($httpCode >= 400) {
        $errorData = json_decode($response, true);
        $errorMessage = isset($errorData['message']) ? $errorData['message'] : 'Error en la API de Mapbox';
        
        http_response_code($httpCode);
        echo json_encode([
            'error' => $errorMessage,
            'http_code' => $httpCode
        ]);
        exit();
    }
    
    $jsonData = json_decode($response, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        http_response_code(502);
        echo json_encode([
            'error' => 'Respuesta inválida de Mapbox',
            'details' => json_last_error_msg()
        ]);
        exit();
    }
    
    http_response_code(200);
    echo $response;
    
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => 'Error del servidor',
        'message' => $e->getMessage()
    ]);
}
?>
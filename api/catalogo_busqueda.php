<?php

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

require_once __DIR__ . '/../database/db_config.php';

try {
    $pdo = conectarBD();

    // 1. Edificios
    $stmtEdif = $pdo->query("
        SELECT 
            id_edificio,
            codigo,
            nombre_comun,
            descripcion,
            latitud,
            longitud
        FROM edificios
        ORDER BY codigo ASC
    ");
    $edificios = $stmtEdif ? $stmtEdif->fetchAll(PDO::FETCH_ASSOC) : [];

    foreach ($edificios as &$ed) {
        $ed['id_edificio'] = (int)$ed['id_edificio'];
        $ed['latitud'] = (float)$ed['latitud'];
        $ed['longitud'] = (float)$ed['longitud'];
    }
    unset($ed);

    // 2. Todos los espacios (Aulas, Laboratorios, Talleres, Cubículos, etc.)
    $stmtEsp = $pdo->query("
        SELECT 
            esp.id_espacio,
            esp.codigo_completo,
            esp.numero_espacio,
            esp.nombre_descriptivo,
            esp.nivel_piso,
            esp.id_tipo,
            tipo.nombre_tipo,
            edif.codigo AS codigo_edificio,
            edif.nombre_comun AS nombre_edificio,
            edif.latitud AS lat_edificio,
            edif.longitud AS lng_edificio,
            prof.numero_empleado,
            prof.titulo,
            prof.nombre_completo AS profesor_asignado
        FROM espacios esp
        INNER JOIN cat_tipos_espacio tipo ON esp.id_tipo = tipo.id_tipo
        INNER JOIN edificios edif ON esp.id_edificio = edif.id_edificio
        LEFT JOIN profesores prof ON esp.id_profesor_asignado = prof.id_profesor
        ORDER BY edif.codigo ASC, esp.nivel_piso ASC, esp.numero_espacio ASC
    ");
    $espacios = $stmtEsp ? $stmtEsp->fetchAll(PDO::FETCH_ASSOC) : [];

    foreach ($espacios as &$esp) {
        $esp['id_espacio'] = (int)$esp['id_espacio'];
        $esp['id_tipo'] = (int)$esp['id_tipo'];
        $esp['lat_edificio'] = (float)$esp['lat_edificio'];
        $esp['lng_edificio'] = (float)$esp['lng_edificio'];
    }
    unset($esp);

    // 3. Profesores activos (con cubículo asignado)
    $stmtProf = $pdo->query("
        SELECT DISTINCT
            prof.id_profesor,
            prof.nombre_completo,
            prof.numero_empleado,
            prof.titulo,
            esp.codigo_completo AS codigo_oficina,
            esp.numero_espacio AS numero_oficina,
            esp.nivel_piso AS piso_oficina,
            edif.codigo AS codigo_edificio,
            edif.nombre_comun AS nombre_edificio,
            edif.latitud AS lat_edificio,
            edif.longitud AS lng_edificio
        FROM profesores prof
        INNER JOIN espacios esp ON prof.id_profesor = esp.id_profesor_asignado
        INNER JOIN edificios edif ON esp.id_edificio = edif.id_edificio
        WHERE prof.estatus = 'Activo'
        ORDER BY prof.nombre_completo ASC
    ");
    $profesores = $stmtProf ? $stmtProf->fetchAll(PDO::FETCH_ASSOC) : [];

    foreach ($profesores as &$pr) {
        $pr['id_profesor'] = (int)$pr['id_profesor'];
        $pr['lat_edificio'] = (float)$pr['lat_edificio'];
        $pr['lng_edificio'] = (float)$pr['lng_edificio'];
    }
    unset($pr);

    // 4. Puntos de interés
    $puntosInteres = [];
    $stmtCheckPoi = $pdo->query("SHOW TABLES LIKE 'puntos_interes'");
    if ($stmtCheckPoi && $stmtCheckPoi->fetchColumn()) {
        $stmtPoi = $pdo->query("
            SELECT id, categoria, nombre, descripcion, latitud, longitud
            FROM puntos_interes
            ORDER BY actualizado_en ASC
        ");
        $rowsPoi = $stmtPoi ? $stmtPoi->fetchAll(PDO::FETCH_ASSOC) : [];
        foreach ($rowsPoi as $r) {
            $puntosInteres[] = [
                'id'          => (string)$r['id'],
                'categoria'   => (string)$r['categoria'],
                'nombre'      => (string)($r['nombre'] ?? ''),
                'descripcion' => (string)($r['descripcion'] ?? ''),
                'lat'         => (float)$r['latitud'],
                'lng'         => (float)$r['longitud']
            ];
        }
    } else {
        $stmtCheckLegacy = $pdo->query("SHOW TABLES LIKE 'grafo_ediciones'");
        if ($stmtCheckLegacy && $stmtCheckLegacy->fetchColumn()) {
            $stmtLegacy = $pdo->query("SELECT datos FROM grafo_ediciones WHERE id = 1 LIMIT 1");
            $fila = $stmtLegacy ? $stmtLegacy->fetch(PDO::FETCH_ASSOC) : null;
            if ($fila && !empty($fila['datos'])) {
                $json = json_decode($fila['datos'], true);
                if (is_array($json) && !empty($json['puntos_interes']) && is_array($json['puntos_interes'])) {
                    foreach ($json['puntos_interes'] as $p) {
                        if (!isset($p['lat'], $p['lng'])) continue;
                        $puntosInteres[] = [
                            'id'          => (string)($p['id'] ?? ''),
                            'categoria'   => (string)($p['categoria'] ?? 'banos'),
                            'nombre'      => trim((string)($p['nombre'] ?? '')),
                            'descripcion' => trim((string)($p['descripcion'] ?? '')),
                            'lat'         => (float)$p['lat'],
                            'lng'         => (float)$p['lng']
                        ];
                    }
                }
            }
        }
    }

    $payload = json_encode([
        'success'        => true,
        'edificios'      => $edificios,
        'espacios'       => $espacios,
        'profesores'     => $profesores,
        'puntos_interes' => $puntosInteres
    ], JSON_UNESCAPED_UNICODE);

    $etag = '"' . md5($payload) . '"';
    header('Cache-Control: no-cache, must-revalidate');
    header('ETag: ' . $etag);

    if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH']) === $etag) {
        http_response_code(304);
        exit;
    }

    echo $payload;

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'error'   => true,
        'mensaje' => 'Error de base de datos al construir catálogo',
        'detalle' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error'   => true,
        'mensaje' => 'Error interno del servidor',
        'detalle' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
<?php

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

require_once __DIR__ . '/../database/db_config.php';

try {
    $pdo = conectarBD();
    
    // Parámetros de búsqueda
    $buscar = $_GET['buscar'] ?? null;
    $edificio = $_GET['edificio'] ?? null;
    $conOficina = isset($_GET['con_oficina']) && $_GET['con_oficina'] == '1';
    $limit = intval($_GET['limit'] ?? 100);
    
    // Validar limites
    if ($limit > 200) $limit = 200;
    if ($limit < 1) $limit = 100;
    
    $sql = "
        SELECT DISTINCT
            prof.id_profesor,
            prof.nombre_completo,
            prof.email,
            prof.telefono,
            prof.estatus,
            esp.codigo_completo as codigo_oficina,
            esp.numero_espacio as numero_oficina,
            esp.nivel_piso as piso_oficina,
            edif.codigo as codigo_edificio,
            edif.nombre_comun as nombre_edificio,
            edif.latitud as lat_edificio,
            edif.longitud as lng_edificio
        FROM profesores prof
        LEFT JOIN espacios esp ON prof.id_profesor = esp.id_profesor_asignado
        LEFT JOIN edificios edif ON esp.id_edificio = edif.id_edificio
        WHERE prof.estatus = 'Activo'
    ";
    
    $params = [];
    
    // Filtro por búsqueda de nombre
    if ($buscar) {
        $sql .= " AND (
            prof.nombre_completo LIKE :buscar_like
        )";
        $params[':buscar_like'] = '%' . $buscar . '%';
    }
    
    // Filtro por edificio
    if ($edificio) {
        $sql .= " AND edif.codigo = :edificio";
        $params[':edificio'] = strtoupper($edificio);
    }
    
    // Filtro solo profesores con oficina
    if ($conOficina) {
        $sql .= " AND esp.id_espacio IS NOT NULL";
    }
    
    $sql .= " ORDER BY prof.nombre_completo ASC";
    $sql .= " LIMIT :limit";
    
    $stmt = $pdo->prepare($sql);
    
    // Bind de parámetros
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value);
    }
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    
    $stmt->execute();
    $profesores = $stmt->fetchAll();
    
    $stmtStats = $pdo->query("
        SELECT 
            COUNT(*) as total_profesores,
            SUM(CASE WHEN esp.id_espacio IS NOT NULL THEN 1 ELSE 0 END) as con_oficina,
            SUM(CASE WHEN esp.id_espacio IS NULL THEN 1 ELSE 0 END) as sin_oficina
        FROM profesores prof
        LEFT JOIN espacios esp ON prof.id_profesor = esp.id_profesor_asignado
        WHERE prof.estatus = 'Activo'
    ");
    $stats = $stmtStats->fetch();
    
    echo json_encode([
        'success' => true,
        'total_resultados' => count($profesores),
        'estadisticas' => $stats,
        'filtros_aplicados' => [
            'buscar' => $buscar,
            'edificio' => $edificio,
            'con_oficina' => $conOficina
        ],
        'profesores' => $profesores
    ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'error' => true,
        'mensaje' => 'Error de base de datos',
        'detalle' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'error' => true,
        'mensaje' => 'Error interno del servidor'
    ], JSON_UNESCAPED_UNICODE);
}
?>

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
    $tipo = $_GET['tipo'] ?? null;
    $capacidadMin = $_GET['capacidad_min'] ?? null;
    $disponible = isset($_GET['disponible']) && $_GET['disponible'] == '1';
    $limit = intval($_GET['limit'] ?? 50);
    
    // Validar limit
    if ($limit > 200) $limit = 200;
    if ($limit < 1) $limit = 50;

    $sql = "
        SELECT 
            esp.id_espacio,
            esp.codigo_completo,
            esp.numero_espacio,
            esp.nombre_descriptivo,
            esp.nivel_piso,
            esp.capacidad,
            tipo.nombre_tipo,
            tipo.id_tipo,
            edif.codigo as codigo_edificio,
            edif.nombre_comun as nombre_edificio,
            edif.latitud as lat_edificio,
            edif.longitud as lng_edificio,
            prof.nombre_completo as profesor_asignado,
            prof.email as email_profesor
        FROM espacios esp
        INNER JOIN cat_tipos_espacio tipo ON esp.id_tipo = tipo.id_tipo
        INNER JOIN edificios edif ON esp.id_edificio = edif.id_edificio
        LEFT JOIN profesores prof ON esp.id_profesor_asignado = prof.id_profesor
        WHERE 1=1
    ";
    
    $params = [];
    
    // Filtro por búsqueda de texto
    if ($buscar) {
        $sql .= " AND (
            esp.codigo_completo LIKE :buscar_wild1
            OR esp.numero_espacio LIKE :buscar_wild2
            OR esp.nombre_descriptivo LIKE :buscar_wild3
        )";
        $params[':buscar_wild1'] = '%' . $buscar . '%';
        $params[':buscar_wild2'] = '%' . $buscar . '%';
        $params[':buscar_wild3'] = '%' . $buscar . '%';
    }
    
    // Filtro por edificio
    if ($edificio) {
        $sql .= " AND edif.codigo = :edificio";
        $params[':edificio'] = strtoupper($edificio);
    }
    
    // Filtro por tipo de espacio
    if ($tipo) {
        $sql .= " AND esp.id_tipo = :tipo";
        $params[':tipo'] = intval($tipo);
    }
    
    // Filtro por capacidad mínima
    if ($capacidadMin) {
        $sql .= " AND esp.capacidad >= :capacidad";
        $params[':capacidad'] = intval($capacidadMin);
    }
    
    // Filtro por disponibilidad
    if ($disponible) {
        $sql .= " AND esp.id_profesor_asignado IS NULL";
    }
    
    $sql .= " ORDER BY edif.codigo ASC, esp.nivel_piso ASC, esp.numero_espacio ASC";
    $sql .= " LIMIT :limit";
    

    $stmt = $pdo->prepare($sql);
    
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value);
    }
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    
    $stmt->execute();
    $espacios = $stmt->fetchAll();

    echo json_encode([
        'success' => true,
        'total' => count($espacios),
        'filtros_aplicados' => [
            'buscar' => $buscar,
            'edificio' => $edificio,
            'tipo' => $tipo,
            'capacidad_min' => $capacidadMin,
            'disponible' => $disponible
        ],
        'espacios' => $espacios
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

<?php

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

require_once __DIR__ . '/../database/db_config.php';

try {
    $pdo = conectarBD();

    $totalEspaciosSql = "(
        SELECT COUNT(*)
        FROM espacios esp
        WHERE esp.id_edificio = e.id_edificio
    ) AS total_espacios";
    
    // Parámetros de búsqueda
    $codigo = $_GET['codigo'] ?? null;
    $buscar = $_GET['buscar'] ?? null;
    $incluirCoords = isset($_GET['coords']) && $_GET['coords'] == '1';
    

    if ($codigo) {
        $stmt = $pdo->prepare("
            SELECT 
                e.id_edificio,
                e.codigo,
                e.nombre_comun,
                e.descripcion,
                e.latitud,
                e.longitud,
                e.foto_principal_url,
                e.numero_pisos,
                e.estatus,
                {$totalEspaciosSql}
            FROM edificios e
            WHERE e.codigo = :codigo
        ");
        
        $stmt->execute([':codigo' => strtoupper($codigo)]);
        $edificio = $stmt->fetch();
        
        if (!$edificio) {
            http_response_code(404);
            echo json_encode([
                'error' => true,
                'mensaje' => 'Edificio no encontrado',
                'codigo' => $codigo
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        
        // Agregar coordenadas del polígono si se solicitó
        if ($incluirCoords) {
            $stmtCoords = $pdo->prepare("
                SELECT latitud, longitud, orden
                FROM coordenadas_poligono
                WHERE id_edificio = :id
                ORDER BY orden ASC
            ");
            $stmtCoords->execute([':id' => $edificio['id_edificio']]);
            $edificio['coordenadas_poligono'] = $stmtCoords->fetchAll();
        }
        
        // Obtener imágenes
        $stmtImgs = $pdo->prepare("
            SELECT url, tipo_imagen, orden
            FROM imagenes_edificio
            WHERE id_edificio = :id
            ORDER BY orden ASC
        ");
        $stmtImgs->execute([':id' => $edificio['id_edificio']]);
        $edificio['imagenes'] = $stmtImgs->fetchAll();
        
        // Obtener alias
        $stmtAlias = $pdo->prepare("
            SELECT alias FROM edificios_aliases WHERE id_edificio = :id
        ");
        $stmtAlias->execute([':id' => $edificio['id_edificio']]);
        $edificio['alias'] = $stmtAlias->fetchAll(PDO::FETCH_COLUMN);
        
        echo json_encode([
            'success' => true,
            'edificio' => $edificio
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }
    

    if ($buscar) {
        $stmt = $pdo->prepare("
            SELECT DISTINCT
                e.id_edificio,
                e.codigo,
                e.nombre_comun,
                e.descripcion,
                e.latitud,
                e.longitud,
                e.foto_principal_url,
                e.numero_pisos,
                {$totalEspaciosSql},
                (
                    (CASE WHEN e.codigo LIKE :buscar_like_codigo_score THEN 100 ELSE 0 END) +
                    (CASE WHEN e.nombre_comun LIKE :buscar_like_nombre_score THEN 50 ELSE 0 END) +
                    (CASE WHEN ea.alias LIKE :buscar_like_alias_score THEN 40 ELSE 0 END) +
                    (CASE WHEN e.descripcion LIKE :buscar_like_desc_score THEN 10 ELSE 0 END)
                ) as relevancia
            FROM edificios e
            LEFT JOIN edificios_aliases ea ON e.id_edificio = ea.id_edificio
            WHERE 
                e.nombre_comun LIKE :buscar_like_nombre
                OR e.descripcion LIKE :buscar_like_desc
                OR e.codigo LIKE :buscar_like_codigo
                OR ea.alias LIKE :buscar_like_alias
            ORDER BY relevancia DESC, e.codigo ASC
            LIMIT 20
        ");
        
        $stmt->execute([
            ':buscar_like_codigo_score' => '%' . $buscar . '%',
            ':buscar_like_nombre_score' => '%' . $buscar . '%',
            ':buscar_like_alias_score' => '%' . $buscar . '%',
            ':buscar_like_desc_score' => '%' . $buscar . '%',
            ':buscar_like_nombre' => '%' . $buscar . '%',
            ':buscar_like_desc' => '%' . $buscar . '%',
            ':buscar_like_codigo' => '%' . $buscar . '%',
            ':buscar_like_alias' => '%' . $buscar . '%'
        ]);
        
        $resultados = $stmt->fetchAll();
        
        echo json_encode([
            'success' => true,
            'total' => count($resultados),
            'edificios' => $resultados
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit;
    }
    
    $stmt = $pdo->query("
        SELECT 
            e.id_edificio,
            e.codigo,
            e.nombre_comun,
            e.descripcion,
            e.latitud,
            e.longitud,
            e.foto_principal_url,
            e.numero_pisos,
            {$totalEspaciosSql}
        FROM edificios e
        ORDER BY e.codigo ASC
    ");
    
    $edificios = $stmt->fetchAll();

    foreach ($edificios as &$edificio) {
        $stmtAlias = $pdo->prepare("SELECT alias FROM edificios_aliases WHERE id_edificio = :id");
        $stmtAlias->execute([':id' => $edificio['id_edificio']]);
        $edificio['alias'] = $stmtAlias->fetchAll(PDO::FETCH_COLUMN);
    }
    unset($edificio);
    
    if ($incluirCoords) {
        foreach ($edificios as &$edificio) {
            $stmtCoords = $pdo->prepare("
                SELECT latitud, longitud, orden
                FROM coordenadas_poligono
                WHERE id_edificio = :id
                ORDER BY orden ASC
            ");
            $stmtCoords->execute([':id' => $edificio['id_edificio']]);
            $edificio['coordenadas_poligono'] = $stmtCoords->fetchAll();
        }
    }
    
    echo json_encode([
        'success' => true,
        'total' => count($edificios),
        'edificios' => $edificios
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

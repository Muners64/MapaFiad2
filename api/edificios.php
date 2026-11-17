<?php

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

require_once __DIR__ . '/../database/db_config.php';

try {
    $pdo = conectarBD();

    // 1. Endpoint ligero: SOLO coordenadas de polígonos (para carga inicial y caché)
    if (isset($_GET['solo_poligonos']) && $_GET['solo_poligonos'] === '1') {
        header('Cache-Control: public, max-age=86400');

        $stmt = $pdo->query("
            SELECT 
                cp.id_edificio,
                e.codigo,
                e.nombre_comun,
                cp.latitud,
                cp.longitud,
                cp.orden
            FROM coordenadas_poligono cp
            INNER JOIN edificios e ON e.id_edificio = cp.id_edificio
            ORDER BY cp.id_edificio ASC, cp.orden ASC
        ");

        $poligonos = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'success' => true,
            'poligonos' => $poligonos
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 2. Endpoint bajo demanda: detalle de UN solo edificio al hacer clic (por id o codigo)
    $idEdificio = isset($_GET['id']) ? intval($_GET['id']) : null;
    $codigo = $_GET['codigo'] ?? null;

    if ($idEdificio || $codigo) {
        header('Cache-Control: public, max-age=3600');

        $totalEspaciosSql = "(
            SELECT COUNT(*)
            FROM espacios esp
            WHERE esp.id_edificio = e.id_edificio
        ) AS total_espacios";

        if ($idEdificio) {
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
                WHERE e.id_edificio = :id
                LIMIT 1
            ");
            $stmt->execute([':id' => $idEdificio]);
        } else {
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
                LIMIT 1
            ");
            $stmt->execute([':codigo' => strtoupper($codigo)]);
        }

        $edificio = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$edificio) {
            http_response_code(404);
            echo json_encode([
                'error' => true,
                'mensaje' => 'Edificio no encontrado'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        if (isset($_GET['coords']) && $_GET['coords'] === '1') {
            $stmtCoords = $pdo->prepare("
                SELECT latitud, longitud, orden
                FROM coordenadas_poligono
                WHERE id_edificio = :id
                ORDER BY orden ASC
            ");
            $stmtCoords->execute([':id' => $edificio['id_edificio']]);
            $edificio['coordenadas_poligono'] = $stmtCoords->fetchAll(PDO::FETCH_ASSOC);
        }

        $stmtImgs = $pdo->prepare("
            SELECT url, tipo_imagen, orden
            FROM imagenes_edificio
            WHERE id_edificio = :id
            ORDER BY orden ASC
        ");
        $stmtImgs->execute([':id' => $edificio['id_edificio']]);
        $edificio['imagenes'] = $stmtImgs->fetchAll(PDO::FETCH_ASSOC);

        $stmtAlias = $pdo->prepare("
            SELECT alias FROM edificios_aliases WHERE id_edificio = :id
        ");
        $stmtAlias->execute([':id' => $edificio['id_edificio']]);
        $edificio['alias'] = $stmtAlias->fetchAll(PDO::FETCH_COLUMN);

        echo json_encode([
            'success' => true,
            'edificio' => $edificio
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 3. Endpoint ligero para el buscador (sin polígonos pesados ni N+1)
    if (isset($_GET['buscar'])) {
        $buscar = $_GET['buscar'];
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
                (
                    (CASE WHEN e.codigo LIKE :s1 THEN 100 ELSE 0 END) +
                    (CASE WHEN e.nombre_comun LIKE :s2 THEN 50 ELSE 0 END) +
                    (CASE WHEN ea.alias LIKE :s3 THEN 40 ELSE 0 END) +
                    (CASE WHEN e.descripcion LIKE :s4 THEN 10 ELSE 0 END)
                ) AS relevancia
            FROM edificios e
            LEFT JOIN edificios_aliases ea ON e.id_edificio = ea.id_edificio
            WHERE 
                e.nombre_comun LIKE :b1
                OR e.descripcion LIKE :b2
                OR e.codigo LIKE :b3
                OR ea.alias LIKE :b4
            ORDER BY relevancia DESC, e.codigo ASC
            LIMIT 20
        ");

        $like = '%' . $buscar . '%';
        $stmt->execute([
            ':s1' => $like, ':s2' => $like, ':s3' => $like, ':s4' => $like,
            ':b1' => $like, ':b2' => $like, ':b3' => $like, ':b4' => $like
        ]);

        $resultados = $stmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode([
            'success' => true,
            'total' => count($resultados),
            'edificios' => $resultados
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 4. Listado básico para sugerencias de búsqueda (1 consulta + 1 consulta de alias)
    header('Cache-Control: public, max-age=3600');
    $stmt = $pdo->query("
        SELECT 
            id_edificio,
            codigo,
            nombre_comun,
            latitud,
            longitud
        FROM edificios
        ORDER BY codigo ASC
    ");
    $edificios = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $stmtAlias = $pdo->query("SELECT id_edificio, alias FROM edificios_aliases");
    $aliasesMap = [];
    foreach ($stmtAlias->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $aliasesMap[$row['id_edificio']][] = $row['alias'];
    }

    foreach ($edificios as &$edificio) {
        $edificio['alias'] = $aliasesMap[$edificio['id_edificio']] ?? [];
    }
    unset($edificio);

    echo json_encode([
        'success' => true,
        'total' => count($edificios),
        'edificios' => $edificios
    ], JSON_UNESCAPED_UNICODE);

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
<?php

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if (session_status() === PHP_SESSION_ACTIVE) {
    session_write_close();
}

require_once __DIR__ . '/../database/db_config.php';

$editEnabled = filter_var(getenv('EDIT_FLAG'), FILTER_VALIDATE_BOOLEAN);

function asegurarTablaPuntosInteres($pdo) {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS puntos_interes (
            id VARCHAR(64) PRIMARY KEY,
            categoria VARCHAR(50) NOT NULL,
            nombre VARCHAR(150) NOT NULL DEFAULT '',
            descripcion TEXT NULL,
            latitud DECIMAL(10, 8) NOT NULL,
            longitud DECIMAL(11, 8) NOT NULL,
            actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    ");

    $count = (int)$pdo->query("SELECT COUNT(*) FROM puntos_interes")->fetchColumn();
    if ($count === 0) {
        $stmtCheck = $pdo->query("SHOW TABLES LIKE 'grafo_ediciones'");
        if ($stmtCheck && $stmtCheck->fetchColumn()) {
            $stmtLegacy = $pdo->query("SELECT datos FROM grafo_ediciones WHERE id = 1 LIMIT 1");
            $fila = $stmtLegacy ? $stmtLegacy->fetch(PDO::FETCH_ASSOC) : null;
            if ($fila && !empty($fila['datos'])) {
                $json = json_decode($fila['datos'], true);
                if (is_array($json) && !empty($json['puntos_interes']) && is_array($json['puntos_interes'])) {
                    $ins = $pdo->prepare("
                        INSERT IGNORE INTO puntos_interes (id, categoria, nombre, descripcion, latitud, longitud)
                        VALUES (:id, :cat, :nom, :desc, :lat, :lng)
                    ");
                    foreach ($json['puntos_interes'] as $p) {
                        if (!isset($p['lat'], $p['lng'])) continue;
                        $ins->execute([
                            ':id'   => (string)($p['id'] ?? ('poi_' . uniqid())),
                            ':cat'  => (string)($p['categoria'] ?? 'banos'),
                            ':nom'  => trim((string)($p['nombre'] ?? '')),
                            ':desc' => trim((string)($p['descripcion'] ?? '')),
                            ':lat'  => (float)$p['lat'],
                            ':lng'  => (float)$p['lng']
                        ]);
                    }
                }
            }
        }
    }
}

try {
    $pdo = conectarBD();
    asegurarTablaPuntosInteres($pdo);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $stmt = $pdo->query("
            SELECT id, categoria, nombre, descripcion, latitud, longitud
            FROM puntos_interes
            ORDER BY actualizado_en ASC
        ");
        $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
        $lista = [];

        foreach ($rows as $r) {
            $lista[] = [
                'id'          => (string)$r['id'],
                'categoria'   => (string)$r['categoria'],
                'nombre'      => (string)($r['nombre'] ?? ''),
                'descripcion' => (string)($r['descripcion'] ?? ''),
                'lat'         => (float)$r['latitud'],
                'lng'         => (float)$r['longitud']
            ];
        }

        echo json_encode([
            'success'        => true,
            'edit_enabled'   => $editEnabled,
            'puntos_interes' => $lista
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!$editEnabled) {
            http_response_code(403);
            echo json_encode([
                'error'   => true,
                'mensaje' => 'Modo edición deshabilitado (EDIT_FLAG)'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $raw  = file_get_contents('php://input');
        $json = json_decode($raw, true);

        if (!is_array($json) || !isset($json['puntos_interes']) || !is_array($json['puntos_interes'])) {
            http_response_code(400);
            echo json_encode([
                'error'   => true,
                'mensaje' => 'Formato de puntos_interes inválido'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $pdo->beginTransaction();
        $pdo->exec("DELETE FROM puntos_interes");

        $stmtIns = $pdo->prepare("
            INSERT INTO puntos_interes (id, categoria, nombre, descripcion, latitud, longitud)
            VALUES (:id, :cat, :nom, :desc, :lat, :lng)
        ");

        $guardados = 0;
        foreach ($json['puntos_interes'] as $p) {
            if (!isset($p['lat'], $p['lng'])) continue;
            $stmtIns->execute([
                ':id'   => (string)($p['id'] ?? ('poi_' . uniqid())),
                ':cat'  => (string)($p['categoria'] ?? 'banos'),
                ':nom'  => trim((string)($p['nombre'] ?? '')),
                ':desc' => trim((string)($p['descripcion'] ?? '')),
                ':lat'  => (float)$p['lat'],
                ':lng'  => (float)$p['lng']
            ]);
            $guardados++;
        }

        $pdo->commit();

        echo json_encode([
            'success' => true,
            'ok'      => true,
            'total'   => $guardados
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }
} catch (Exception $e) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode([
        'error'   => true,
        'mensaje' => 'Error en puntos_interes.php',
        'detalle' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
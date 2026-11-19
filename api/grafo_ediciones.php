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

function osmJsonToGeoJson($osmData) {
    $nodes = [];
    $features = [];
    $elements = $osmData['elements'] ?? [];

    foreach ($elements as $el) {
        if (($el['type'] ?? '') === 'node' and isset($el['id'], $el['lon'], $el['lat'])) {
            $nodes[$el['id']] = [floatval($el['lon']), floatval($el['lat'])];
        }
    }

    foreach ($elements as $el) {
        if (($el['type'] ?? '') !== 'way') {
            continue;
        }

        $tags = $el['tags'] ?? [];
        if (empty($tags['highway'])) {
            continue;
        }
        if (preg_match('/^(motorway|trunk|proposed|construction)$/', $tags['highway'])) {
            continue;
        }

        $coords = [];
        if (!empty($el['geometry']) and is_array($el['geometry'])) {
            foreach ($el['geometry'] as $pt) {
                if (isset($pt['lon'], $pt['lat'])) {
                    $coords[] = [floatval($pt['lon']), floatval($pt['lat'])];
                }
            }
        } elseif (!empty($el['nodes']) and is_array($el['nodes'])) {
            foreach ($el['nodes'] as $nid) {
                if (isset($nodes[$nid])) {
                    $coords[] = $nodes[$nid];
                }
            }
        }

        if (count($coords) >= 2) {
            $wayId = 'way/' . $el['id'];
            $tags['id'] = $wayId;
            $features[] = [
                'type' => 'Feature',
                'id' => $wayId,
                'properties' => $tags,
                'geometry' => [
                    'type' => 'LineString',
                    'coordinates' => $coords
                ]
            ];
        }
    }

    return [
        'type' => 'FeatureCollection',
        'features' => $features
    ];
}

function hacerPeticionHttp($url, $postBody = null, $timeout = 10) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    if ($postBody !== null) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postBody);
    }
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_TIMEOUT, $timeout);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_USERAGENT, 'MapaFIAD-UABC/1.0 (campus-routing)');

    $resp = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($resp !== false and $httpCode === 200) {
        return $resp;
    }
    return false;
}

function obtenerEdificiosExistentes($pdo) {
    $colsRes = $pdo->query("SHOW COLUMNS FROM edificios");
    $cols = $colsRes ? $colsRes->fetchAll(PDO::FETCH_COLUMN) : [];
    if (empty($cols)) {
        return [];
    }

    $pkCol = in_array('id_edificio', $cols, true) ? 'id_edificio' : (in_array('id', $cols, true) ? 'id' : null);
    if ($pkCol === null or !in_array('latitud', $cols, true) or !in_array('longitud', $cols, true)) {
        return [];
    }

    $codCol = in_array('codigo', $cols, true)
        ? 'codigo'
        : (in_array('codigo_edificio', $cols, true) ? 'codigo_edificio' : null);
    $codExpr = $codCol !== null ? $codCol : "''";

    $nomCol = in_array('nombre_comun', $cols, true)
        ? 'nombre_comun'
        : (in_array('nombre', $cols, true) ? 'nombre' : null);
    $nomExpr = $nomCol !== null ? $nomCol : "''";

    $sql = "SELECT {$pkCol} AS id_edificio, {$codExpr} AS codigo, {$nomExpr} AS nombre_comun, latitud, longitud
            FROM edificios
            WHERE latitud IS NOT NULL AND longitud IS NOT NULL
            ORDER BY {$pkCol} ASC";

    $stmt = $pdo->query($sql);
    $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];
    $resultado = [];

    foreach ($rows as $r) {
        $codigoVal = trim((string)($r['codigo'] ?? ''));
        $resultado[] = [
            'id_edificio'     => (int)$r['id_edificio'],
            'codigo'          => $codigoVal,
            'codigo_edificio' => $codigoVal,
            'nombre_comun'    => trim((string)($r['nombre_comun'] ?? '')),
            'latitud'         => (float)$r['latitud'],
            'longitud'        => (float)$r['longitud']
        ];
    }

    return $resultado;
}

try {
    $pdo = conectarBD();

    // =====================================================================
    // 1. ENDPOINT DE RED PEATONAL OSM CON CACHÉ PERMANENTE EN MYSQL (id = 2)
    // =====================================================================
    if ($_SERVER['REQUEST_METHOD'] === 'GET' and isset($_GET['osm']) and $_GET['osm'] === '1') {
        $s = floatval($_GET['s'] ?? 31.860);
        $w = floatval($_GET['w'] ?? -116.672);
        $n = floatval($_GET['n'] ?? 31.870);
        $e = floatval($_GET['e'] ?? -116.660);
        $forzar = (isset($_GET['force']) and $_GET['force'] === '1');

        $stmtCache = $pdo->query("SELECT datos FROM grafo_ediciones WHERE id = 2 LIMIT 1");
        $filaCache = $stmtCache->fetch(PDO::FETCH_ASSOC);
        $cacheExistente = null;

        if ($filaCache and !empty($filaCache['datos'])) {
            $cacheExistente = json_decode($filaCache['datos'], true);
            if (!$forzar and is_array($cacheExistente) and isset($cacheExistente['geojson'], $cacheExistente['bbox'])) {
                $b = $cacheExistente['bbox'];
                if ($s >= $b['s'] and $w >= $b['w'] and $n <= $b['n'] and $e <= $b['e']) {
                    echo json_encode($cacheExistente['geojson'], JSON_UNESCAPED_UNICODE);
                    exit;
                }
            }
        }

        $pad = 0.0040;
        $bs = round($s - $pad, 6);
        $bw = round($w - $pad, 6);
        $bn = round($n + $pad, 6);
        $be = round($e + $pad, 6);

        $geojson = null;

        // Fuente A: API oficial v0.6 de OpenStreetMap
        $osmApiUrl = "https://api.openstreetmap.org/api/0.6/map.json?bbox={$bw},{$bs},{$be},{$bn}";
        $respOsm = hacerPeticionHttp($osmApiUrl, null, 10);
        if ($respOsm !== false) {
            $parsed = json_decode($respOsm, true);
            if (is_array($parsed) and !empty($parsed['elements'])) {
                $candidato = osmJsonToGeoJson($parsed);
                if (!empty($candidato['features'])) {
                    $geojson = $candidato;
                }
            }
        }

        // Fuente B: Overpass con 'out geom;'
        if ($geojson === null) {
            $query = "[out:json][timeout:10];way[\"highway\"][\"highway\"!~\"motorway|trunk|proposed|construction\"]({$bs},{$bw},{$bn},{$be});out geom;";
            $postData = 'data=' . urlencode($query);
            $mirrors = [
                'https://overpass-api.de/api/interpreter',
                'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
            ];

            foreach ($mirrors as $mirrorUrl) {
                $respOv = hacerPeticionHttp($mirrorUrl, $postData, 10);
                if ($respOv !== false) {
                    $parsed = json_decode($respOv, true);
                    if (is_array($parsed) and !empty($parsed['elements'])) {
                        $candidato = osmJsonToGeoJson($parsed);
                        if (!empty($candidato['features'])) {
                            $geojson = $candidato;
                            break;
                        }
                    }
                }
            }
        }

        if ($geojson !== null) {
            $payloadCache = json_encode([
                'bbox' => ['s' => $bs, 'w' => $bw, 'n' => $bn, 'e' => $be],
                'ts' => time(),
                'geojson' => $geojson
            ], JSON_UNESCAPED_UNICODE);

            $stmtSave = $pdo->prepare("
                INSERT INTO grafo_ediciones (id, datos) VALUES (2, :datos)
                ON DUPLICATE KEY UPDATE datos = VALUES(datos)
            ");
            $stmtSave->execute([':datos' => $payloadCache]);

            echo json_encode($geojson, JSON_UNESCAPED_UNICODE);
            exit;
        }

        if (is_array($cacheExistente) and isset($cacheExistente['geojson'])) {
            echo json_encode($cacheExistente['geojson'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        http_response_code(503);
        echo json_encode([
            'error' => true,
            'mensaje' => 'No se pudo obtener el mapa base de OpenStreetMap'
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // =====================================================================
    // 2. GET: ENTREGAR EDIT_FLAG, EDICIONES, POIs Y EDIFICIOS EXISTENTES
    // =====================================================================
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $stmt = $pdo->query("SELECT datos FROM grafo_ediciones WHERE id = 1 LIMIT 1");
        $fila = $stmt->fetch(PDO::FETCH_ASSOC);

        $overrides = new stdClass();
        $tramosNuevos = [
            'type'     => 'FeatureCollection',
            'features' => []
        ];
        $puntosInteres = [];

        if ($fila and !empty($fila['datos'])) {
            $guardado = json_decode($fila['datos'], true);
            if (is_array($guardado)) {
                if (!empty($guardado['overrides'])) {
                    $overrides = $guardado['overrides'];
                }
                if (isset($guardado['tramos_nuevos'])) {
                    $tramosNuevos = $guardado['tramos_nuevos'];
                }
                if (isset($guardado['puntos_interes']) and is_array($guardado['puntos_interes'])) {
                    $puntosInteres = $guardado['puntos_interes'];
                }
            }
        }

        $edificiosExistentes = $editEnabled ? obtenerEdificiosExistentes($pdo) : [];

        echo json_encode([
            'success'              => true,
            'edit_enabled'         => $editEnabled,
            'overrides'            => $overrides,
            'tramos_nuevos'        => $tramosNuevos,
            'puntos_interes'       => $puntosInteres,
            'edificios_existentes' => $edificiosExistentes
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // =====================================================================
    // 3. POST: GUARDAR GRAFO, POIs, EDIFICIOS NUEVOS Y COORDENADAS ACTUALIZADAS
    // =====================================================================
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

        if (!is_array($json) or !isset($json['overrides']) or !isset($json['tramos_nuevos'])) {
            http_response_code(400);
            echo json_encode([
                'error'   => true,
                'mensaje' => 'Formato de ediciones inválido'
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $overrides             = empty($json['overrides']) ? new stdClass() : $json['overrides'];
        $tramosNuevos          = $json['tramos_nuevos'];
        $puntosInteres         = (isset($json['puntos_interes']) and is_array($json['puntos_interes'])) ? $json['puntos_interes'] : [];
        $edificiosNuevos       = (isset($json['edificios_nuevos']) and is_array($json['edificios_nuevos'])) ? $json['edificios_nuevos'] : [];
        $edificiosActualizados = (isset($json['edificios_actualizados']) and is_array($json['edificios_actualizados'])) ? $json['edificios_actualizados'] : [];

        $pdo->beginTransaction();

        $colsRes = $pdo->query("SHOW COLUMNS FROM edificios");
        $columnasEdif = $colsRes ? $colsRes->fetchAll(PDO::FETCH_COLUMN) : [];
        $pkCol = in_array('id_edificio', $columnasEdif, true) ? 'id_edificio' : (in_array('id', $columnasEdif, true) ? 'id' : null);

        // 3A. Actualizar coordenadas de destino de edificios ya existentes
        $edificiosModificados = 0;
        if ($pkCol !== null and count($edificiosActualizados) > 0) {
            $stmtUpd = $pdo->prepare("UPDATE edificios SET latitud = :lat, longitud = :lng WHERE {$pkCol} = :id");
            foreach ($edificiosActualizados as $item) {
                if (!isset($item['id_edificio'], $item['latitud'], $item['longitud'])) {
                    continue;
                }
                $stmtUpd->execute([
                    ':lat' => (float)$item['latitud'],
                    ':lng' => (float)$item['longitud'],
                    ':id'  => (int)$item['id_edificio']
                ]);
                $edificiosModificados++;
            }
        }

        // 3B. Insertar edificios nuevos con su punto de destino y polígono
        $edificiosInsertados = 0;
        if (count($edificiosNuevos) > 0 and count($columnasEdif) > 0) {
            foreach ($edificiosNuevos as$ed) {
                $vertices =$ed['vertices'] ?? [];
                if (!is_array($vertices) or count($vertices) < 3) {
                    continue;
                }

                $latDest = (float)($ed['latitud'] ?? 0);$lngDest = (float)($ed['longitud'] ?? 0);$cod     = trim((string)($ed['codigo'] ?? $ed['codigo_edificio'] ?? ('E_NEW_' . time())));
                $nom     = trim((string)($ed['nombre_comun'] ?? $cod));

                $campos  = [];
                $valores = [];$params  = [];

                if (in_array('codigo', $columnasEdif, true)) {
                    $campos[] = 'codigo';$valores[] = ':cod';
                    $params[':cod'] =$cod;
                } elseif (in_array('codigo_edificio', $columnasEdif, true)) {
                    $campos[] = 'codigo_edificio';$valores[] = ':cod';
                    $params[':cod'] =$cod;
                }
                if (in_array('nombre_comun', $columnasEdif, true)) {
                    $campos[] = 'nombre_comun';$valores[] = ':nom';
                    $params[':nom'] =$nom;
                } elseif (in_array('nombre', $columnasEdif, true)) {
                    $campos[] = 'nombre';$valores[] = ':nom';
                    $params[':nom'] =$nom;
                }
                if (in_array('descripcion', $columnasEdif, true)) {
                    $campos[] = 'descripcion';$valores[] = 'NULL';
                }
                if (in_array('latitud', $columnasEdif, true)) {
                    $campos[] = 'latitud';$valores[] = ':lat';
                    $params[':lat'] =$latDest;
                }
                if (in_array('longitud', $columnasEdif, true)) {
                    $campos[] = 'longitud';$valores[] = ':lng';
                    $params[':lng'] =$lngDest;
                }
                if (in_array('foto_principal_url', $columnasEdif, true)) {$campos[] = 'foto_principal_url';
                    $valores[] = ':foto';$params[':foto'] = 'img/prueba.jpg';
                }
                if (in_array('numero_pisos', $columnasEdif, true)) {$campos[] = 'numero_pisos';
                    $valores[] = ':pisos';$params[':pisos'] = 1;
                }

                if (count($campos) > 0) {$sqlEd = "INSERT INTO edificios (" . implode(', ', $campos) . ") VALUES (" . implode(', ', $valores) . ")";
                    $stmtEd = $pdo->prepare($sqlEd);
                    $stmtEd->execute($params);
                    $idEdificio = (int)$pdo->lastInsertId();

                    if ($idEdificio > 0) {
                        $stmtPoly =$pdo->prepare("
                            INSERT INTO coordenadas_poligono (id_edificio, orden, latitud, longitud)
                            VALUES (:id_ed, :ord, :lat, :lng)
                        ");
                        foreach ($vertices as$idxV => $v) {$stmtPoly->execute([
                                ':id_ed' => $idEdificio,
                                ':ord'   => (int)($v['orden'] ?? ($idxV + 1)),
                                ':lat'   => (float)$v['latitud'],
                                ':lng'   => (float)$v['longitud']
                            ]);
                        }
                        $edificiosInsertados++;
                    }
                }
            }
        }

        // 3C. Guardar ediciones del grafo y puntos de interés
        $datosLimpiados = json_encode([
            'overrides'      => $overrides,
            'tramos_nuevos'  => $tramosNuevos,
            'puntos_interes' => $puntosInteres
        ], JSON_UNESCAPED_UNICODE);

        $stmt =$pdo->prepare("
            INSERT INTO grafo_ediciones (id, datos) VALUES (1, :datos)
            ON DUPLICATE KEY UPDATE datos = VALUES(datos)
        ");
        $stmt->execute([':datos' =>$datosLimpiados]);

        $pdo->commit();

        $edificiosActuales = obtenerEdificiosExistentes($pdo);

        echo json_encode([
            'success'               => true,
            'ok'                    => true,
            'edificios_insertados'  => $edificiosInsertados,
            'edificios_modificados' => $edificiosModificados,
            'edificios_existentes'  => $edificiosActuales
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

} catch (PDOException $e) {
    if (isset($pdo) and$pdo instanceof PDO and $pdo->inTransaction()) {$pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode([
        'error'   => true,
        'mensaje' => 'Error de base de datos',
        'detalle' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
} catch (Exception $e) {
    if (isset($pdo) and$pdo instanceof PDO and $pdo->inTransaction()) {$pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode([
        'error'   => true,
        'mensaje' => 'Error interno del servidor',
        'detalle' => $e->getMessage()
    ], JSON_UNESCAPED_UNICODE);
}
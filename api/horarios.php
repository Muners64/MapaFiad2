<?php
header('Content-Type: application/json; charset=utf-8');
date_default_timezone_set('America/Tijuana');

$idHorario   = isset($_GET['id']) ? intval($_GET['id']) : 0;
$numEmpleado = isset($_GET['empleado']) ? trim($_GET['empleado']) : '';

if ($idHorario <= 0 && $numEmpleado === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Se requiere id_horario o número de empleado válido']);
    exit;
}

$cacheDir = sys_get_temp_dir() . '/horarios_cache/';
if (!is_dir($cacheDir)) {
    mkdir($cacheDir, 0777, true);
}

$cacheFile    = $cacheDir . 'edupage_fiad_16.json';
$metaFile     = $cacheDir . 'edupage_fiad_16.meta';
$fallbackFile = __DIR__ . '/../horario_fiad.json';

function obtenerClaveCorteActual() {
    $minActual = (int) date('i');
    return ($minActual >= 59)
        ? date('Y-m-d_H') . ':59'
        : date('Y-m-d_H', strtotime('-1 hour')) . ':59';
}

function debeActualizarCache($cacheFile, $metaFile, $fallbackFile) {
    $existeAlguno = (file_exists($cacheFile) && filesize($cacheFile) > 1000)
                 || (file_exists($fallbackFile) && filesize($fallbackFile) > 1000);

    if (!$existeAlguno) {
        return true;
    }

    $horaActual = (int) date('G');
    if ($horaActual < 6 || $horaActual >= 22) {
        return false;
    }

    $ultimoCorte = file_exists($metaFile) ? trim(file_get_contents($metaFile)) : '';
    return ($ultimoCorte !== obtenerClaveCorteActual());
}

function descargarDesdeEduPage() {
    $url = 'https://fiad.edupage.org/timetable/server/regulartt.js?__func=regularttGetData';
    $payload = json_encode([
        '__args' => [null, '16'],
        '__gsh'  => '00000000'
    ]);

    if (function_exists('curl_init')) {
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
            CURLOPT_TIMEOUT        => 20
        ]);
        $res = curl_exec($ch);
        curl_close($ch);
        if ($res && strpos($res, 'dbiAccessorRes') !== false) {
            return $res;
        }
    }

    $context = stream_context_create([
        'http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/json; charset=UTF-8\r\nReferer: https://fiad.edupage.org/timetable/view.php?num=16\r\n",
            'content' => $payload,
            'timeout' => 20
        ],
        'ssl' => [
            'verify_peer'      => false,
            'verify_peer_name' => false
        ]
    ]);
    $res = @file_get_contents($url, false, $context);
    return ($res && strpos($res, 'dbiAccessorRes') !== false) ? $res : null;
}

function normalizarJsonUtf8($texto) {
    $texto = preg_replace('/^\xEF\xBB\xBF/', '', $texto);
    if (preg_match('/Ã[\x80-\xBF]/', $texto)) {
        $reparado = function_exists('mb_convert_encoding')
            ? mb_convert_encoding($texto, 'ISO-8859-1', 'UTF-8')
            : utf8_decode($texto);
        if (json_decode($reparado) !== null) {
            return $reparado;
        }
    }
    return $texto;
}

// 1. Intentar actualizar caché si corresponde al corte horario
$rawJson = null;
if (debeActualizarCache($cacheFile, $metaFile, $fallbackFile)) {
    $descargado = descargarDesdeEduPage();
    if ($descargado) {
        $descargado = normalizarJsonUtf8($descargado);
        @file_put_contents($cacheFile, $descargado, LOCK_EX);
        @file_put_contents($metaFile, obtenerClaveCorteActual(), LOCK_EX);
        $rawJson = $descargado;
    }
}

// 2. Si no se descargó ahora, leer caché o archivo base local
if (!$rawJson) {
    $origen = (file_exists($cacheFile) && filesize($cacheFile) > 1000) ? $cacheFile : $fallbackFile;
    if (file_exists($origen) && filesize($origen) > 1000) {
        $rawJson = normalizarJsonUtf8(file_get_contents($origen));
    }
}

if (!$rawJson) {
    http_response_code(502);
    echo json_encode(['error' => 'No hay datos de horario disponibles en caché ni conexión con EduPage.']);
    exit;
}

$data = json_decode($rawJson, true);
if (!$data || !isset($data['r']['dbiAccessorRes']['tables'])) {
    http_response_code(500);
    echo json_encode(['error' => 'Formato JSON de EduPage inválido.']);
    exit;
}

// 3. Indexar tablas de EduPage
$tables = [];
foreach ($data['r']['dbiAccessorRes']['tables'] as $t) {
    $tables[$t['id']] = $t['data_rows'];
}

$indexById = function ($rows) {
    $map = [];
    foreach ($rows as $row) {
        $map[$row['id']] = $row;
    }
    return $map;
};

$periods    = $indexById($tables['periods'] ?? []);
$classrooms = $indexById($tables['classrooms'] ?? []);
$classes    = $indexById($tables['classes'] ?? []);
$subjects   = $indexById($tables['subjects'] ?? []);
$teachers   = $indexById($tables['teachers'] ?? []);
$lessons    = $indexById($tables['lessons'] ?? []);
$cards      = $tables['cards'] ?? [];

$esConsultaProfesor = ($numEmpleado !== '');
$targetClassroomId  = null;
$targetTeacherId    = null;
$tituloEspacio      = '';
$codigoEspacio      = '';

if ($esConsultaProfesor) {
    $profesorInfo = null;
    foreach ($teachers as $t) {
        if (isset($t['short']) && trim((string)$t['short']) === $numEmpleado) {
            $profesorInfo = $t;
            break;
        }
    }

    if (!$profesorInfo) {
        http_response_code(404);
        echo json_encode(['error' => 'Profesor no encontrado en EduPage']);
        exit;
    }

    $targetTeacherId = $profesorInfo['id'];
    $tituloEspacio   = trim(($profesorInfo['firstname'] ?? '') . ' ' . ($profesorInfo['lastname'] ?? ''));
    $codigoEspacio   = $profesorInfo['short'];
} else {
    $targetClassroomId = '*' . $idHorario;
    $aulaInfo = $classrooms[$targetClassroomId] ?? null;

    if (!$aulaInfo) {
        http_response_code(404);
        echo json_encode(['error' => 'Aula no encontrada en EduPage']);
        exit;
    }

    $tituloEspacio = $aulaInfo['name'];
    $codigoEspacio = $aulaInfo['short'];
}

$diasNombres   = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
$diaActualIdx  = (int) date('N') - 1;
$horaActualStr = date('H:i');

$bloques     = [];
$claseActual = null;

foreach ($cards as $card) {
    $lesson = $lessons[$card['lessonid']] ?? null;
    if (!$lesson) continue;

    if ($esConsultaProfesor) {
        if (!in_array($targetTeacherId, $lesson['teacherids'] ?? [], true)) continue;
    } else {
        if (!in_array($targetClassroomId, $card['classroomids'] ?? [], true)) continue;
    }

    $subject   = $subjects[$lesson['subjectid']] ?? [];
    $periodNum = intval($card['period']);
    $duracion  = max(1, intval($lesson['durationperiods'] ?? 1));

    $horaInicio = $periods[(string)$periodNum]['starttime'] ?? '';
    $horaFin    = $periods[(string)($periodNum + $duracion - 1)]['endtime'] ?? '';

    $grupos = [];
    $colorGrupo = '#d0e6fb';
    foreach ($lesson['classids'] ?? [] as $idx => $cid) {
        if (isset($classes[$cid])) {
            $grupos[] = $classes[$cid]['short'] ?? $classes[$cid]['name'];
            if ($idx === 0 && !empty($classes[$cid]['color'])) {
                $colorGrupo = $classes[$cid]['color'];
            }
        }
    }

    $metaSecundaria = [];
    if ($esConsultaProfesor) {
        foreach ($card['classroomids'] ?? [] as $crid) {
            if (isset($classrooms[$crid])) {
                $metaSecundaria[] = 'Aula: ' . ($classrooms[$crid]['short'] ?? $classrooms[$crid]['name']);
            }
        }
    } else {
        foreach ($lesson['teacherids'] ?? [] as $tid) {
            if (isset($teachers[$tid])) {
                $metaSecundaria[] = trim(($teachers[$tid]['firstname'] ?? '') . ' ' . ($teachers[$tid]['lastname'] ?? ''));
            }
        }
    }

    $daysMask = $card['days'] ?? '000000';
    for ($d = 0; $d < strlen($daysMask); $d++) {
        if ($daysMask[$d] === '1') {
            $item = [
                'dia_index'   => $d,
                'dia'         => $diasNombres[$d] ?? "Día $d",
                'periodo'     => $periodNum,
                'duracion'    => $duracion,
                'hora_inicio' => $horaInicio,
                'hora_fin'    => $horaFin,
                'materia'     => $subject['name'] ?? 'Materia sin nombre',
                'materia_cor' => $subject['short'] ?? '',
                'grupos'      => implode(', ', $grupos),
                'profesores'  => implode(', ', $metaSecundaria),
                'color'       => $colorGrupo
            ];
            $bloques[] = $item;

            if ($d === $diaActualIdx && $horaInicio && $horaFin) {
                if ($horaActualStr >= $horaInicio && $horaActualStr < $horaFin) {
                    $claseActual = $item;
                }
            }
        }
    }
}

usort($bloques, function ($a, $b) {
    return ($a['dia_index'] <=> $b['dia_index']) ?: ($a['periodo'] <=> $b['periodo']);
});

echo json_encode([
    'id_horario'    => $esConsultaProfesor ? $numEmpleado : $idHorario,
    'aula'          => $tituloEspacio,
    'codigo'        => $codigoEspacio,
    'ocupado_ahora' => ($claseActual !== null),
    'clase_actual'  => $claseActual,
    'actualizado'   => file_exists($metaFile) ? file_get_contents($metaFile) : date('Y-m-d H:i'),
    'bloques'       => $bloques
], JSON_UNESCAPED_UNICODE);
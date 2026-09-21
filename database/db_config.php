<?php
/**
 * Configuración de conexión para el servidor remoto
 */


define('DB_HOST_REMOTE', 'localhost');
define('DB_NAME_REMOTE', 'credenciales');
define('DB_USER_REMOTE', 'credenciales');
define('DB_PASS_REMOTE', 'credenciales');


define('DB_HOST', DB_HOST_REMOTE);
define('DB_NAME', DB_NAME_REMOTE);
define('DB_USER', DB_USER_REMOTE);
define('DB_PASS', DB_PASS_REMOTE);
define('DB_CHARSET', 'utf8mb4');


/**
 * Función para conectar a la base de datos
 * @return PDO Objeto de conexión PDO
 * @throws PDOException si la conexión falla
 */
function conectarBD() {
    static $pdo = null;
    
    // Singleton pattern: reutilizar conexión
    if ($pdo !== null) {
        return $pdo;
    }
    
    $dsn = sprintf(
        "mysql:host=%s;dbname=%s;charset=%s",
        DB_HOST,
        DB_NAME,
        DB_CHARSET
    );
    
    $opciones = [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES " . DB_CHARSET
    ];
    
    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $opciones);
        return $pdo;
    } catch (PDOException $e) {
        error_log("Error de conexión BD: " . $e->getMessage());
        throw new Exception("No se pudo conectar a la base de datos");
    }
}

/**
 * Función auxiliar para sanitizar inputs
 */
function sanitizarInput($input) {
    return htmlspecialchars(strip_tags(trim($input)), ENT_QUOTES, 'UTF-8');
}
?>
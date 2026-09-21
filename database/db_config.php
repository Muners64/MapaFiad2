<?php
/**
 * Configuración de conexión dinámicamente leída de Railway (o local si no existen)
 */

define('DB_HOST', getenv('MYSQLHOST') ?: 'localhost');
define('DB_PORT', getenv('MYSQLPORT') ?: '3306');
define('DB_NAME', getenv('MYSQLDATABASE') ?: 'credenciales');
define('DB_USER', getenv('MYSQLUSER') ?: 'credenciales');
define('DB_PASS', getenv('MYSQLPASSWORD') ?: 'credenciales');
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
    
    // Incluir el puerto (DB_PORT) es vital en Railway
    $dsn = sprintf(
        "mysql:host=%s;port=%s;dbname=%s;charset=%s",
        DB_HOST,
        DB_PORT,
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
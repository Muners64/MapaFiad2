-- ============================================
-- SCHEMA DE BASE DE DATOS - MAPA FIAD
-- Sistema de gestión de edificios, espacios y profesores
-- Fecha: 2026-02-26
-- ============================================

CREATE DATABASE IF NOT EXISTS mapa_fiad CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mapa_fiad;

-- ============================================
-- 1. TIPOS DE ESPACIO
-- ============================================
CREATE TABLE cat_tipos_espacio (
    id_tipo INT PRIMARY KEY AUTO_INCREMENT,
    nombre_tipo VARCHAR(50) NOT NULL UNIQUE COMMENT 'Aula, Laboratorio, Taller, Cubículo',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO cat_tipos_espacio (nombre_tipo) VALUES 
    ('Aula'),
    ('Laboratorio'),
    ('Taller'),
    ('Cubículo');

-- ============================================
-- 2. TABLA DE EDIFICIOS
-- ============================================
CREATE TABLE edificios (
    id_edificio INT PRIMARY KEY AUTO_INCREMENT,
    codigo VARCHAR(20) UNIQUE NOT NULL COMMENT 'E1, E34, E55',
    nombre_comun VARCHAR(100) COMMENT 'Edificio de Ingeniería, etc',
    descripcion TEXT COMMENT 'Descripción larga del edificio',
    

    latitud DECIMAL(10, 8),
    longitud DECIMAL(10, 8),
    

    foto_principal_url VARCHAR(255),
    numero_pisos INT DEFAULT 0,
    estatus ENUM('Activo', 'En construcción', 'Mantenimiento') DEFAULT 'Activo',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_codigo (codigo),
    INDEX idx_coordenadas (latitud, longitud)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 3. COORDENADAS DE LOS POLÍGONOS DE LOS EDIFICIOS
-- ============================================
CREATE TABLE coordenadas_poligono (
    id_coordenada INT PRIMARY KEY AUTO_INCREMENT,
    id_edificio INT NOT NULL,
    orden INT NOT NULL COMMENT 'Orden del punto en el polígono (1, 2, 3...)',
    latitud DECIMAL(10, 8) NOT NULL,
    longitud DECIMAL(10, 8) NOT NULL,
    
    FOREIGN KEY (id_edificio) REFERENCES edificios(id_edificio) ON DELETE CASCADE,
    INDEX idx_edificio_orden (id_edificio, orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 4. IMÁGENES DE EDIFICIOS
-- ============================================
CREATE TABLE imagenes_edificio (
    id_imagen INT PRIMARY KEY AUTO_INCREMENT,
    id_edificio INT NOT NULL,
    tipo_imagen ENUM('Exterior', 'Piso_PB', 'Piso_1', 'Piso_2', 'Piso_3', 'Piso_4') NOT NULL,
    url VARCHAR(255) NOT NULL,
    orden INT DEFAULT 0 COMMENT 'Orden de visualización',
    
    FOREIGN KEY (id_edificio) REFERENCES edificios(id_edificio) ON DELETE CASCADE,
    INDEX idx_edificio_tipo (id_edificio, tipo_imagen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 5. ALIAS DE EDIFICIOS
-- ============================================
CREATE TABLE edificios_aliases (
    id_alias INT PRIMARY KEY AUTO_INCREMENT,
    id_edificio INT NOT NULL,
    alias VARCHAR(100) NOT NULL COMMENT 'E 1, Edificio 1, DIB, etc',
    
    FOREIGN KEY (id_edificio) REFERENCES edificios(id_edificio) ON DELETE CASCADE,
    INDEX idx_alias (alias)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 6. TABLA DE PROFESORES
-- ============================================
CREATE TABLE profesores (
    id_profesor INT PRIMARY KEY AUTO_INCREMENT,
    numero_empleado VARCHAR(20) UNIQUE COMMENT 'ID administrativo',
    titulo VARCHAR(20) COMMENT 'Dr., Mtro., Ing.',
    nombre_completo VARCHAR(150) NOT NULL,
    email VARCHAR(100),
    telefono VARCHAR(20),
    foto_perfil_url VARCHAR(255),
    estatus ENUM('Activo', 'Inactivo', 'Sabatico', 'Jubilado') DEFAULT 'Activo',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_nombre (nombre_completo),
    INDEX idx_estatus (estatus)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 7. TABLA DE ESPACIOS (Aulas, Labs, Talleres, Cubículos)
-- ============================================
CREATE TABLE espacios (
    id_espacio INT PRIMARY KEY AUTO_INCREMENT,
    id_edificio INT NOT NULL,
    id_tipo INT NOT NULL COMMENT 'FK a cat_tipos_espacio',
    
    -- Identificación del espacio
    codigo_completo VARCHAR(50) UNIQUE NOT NULL COMMENT 'E1-101, E34-Lab-A, E55-T3',
    numero_espacio VARCHAR(50) NOT NULL COMMENT '101, Lab-A, T3',
    nombre_descriptivo VARCHAR(200) COMMENT 'Para laboratorios con nombres largos',
    
  
    nivel_piso INT DEFAULT 0 COMMENT '0=PB, 1=Piso 1, 2=Piso 2, etc',
    capacidad INT DEFAULT 0,
    area_m2 DECIMAL(8, 2) DEFAULT NULL,
    
    -- Relación con profesor para los cubículos
    id_profesor_asignado INT NULL,
    

    estatus ENUM('Disponible', 'Ocupado', 'Mantenimiento', 'Fuera de servicio') DEFAULT 'Disponible',
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (id_edificio) REFERENCES edificios(id_edificio) ON DELETE CASCADE,
    FOREIGN KEY (id_tipo) REFERENCES cat_tipos_espacio(id_tipo),
    FOREIGN KEY (id_profesor_asignado) REFERENCES profesores(id_profesor) ON DELETE SET NULL,
    
    INDEX idx_edificio_tipo (id_edificio, id_tipo),
    INDEX idx_codigo (codigo_completo),
    INDEX idx_numero (numero_espacio),
    INDEX idx_profesor (id_profesor_asignado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- 8. VISTA COMBINADA
-- ============================================
CREATE VIEW vista_espacios_completa AS
SELECT 
    e.id_espacio,
    e.codigo_completo,
    e.numero_espacio,
    e.nombre_descriptivo,
    e.nivel_piso,
    e.capacidad,
    e.estatus as estatus_espacio,
    
    ed.id_edificio,
    ed.codigo as codigo_edificio,
    ed.nombre_comun as nombre_edificio,
    ed.latitud,
    ed.longitud,
    
    t.id_tipo,
    t.nombre_tipo,
    
    p.id_profesor,
    p.nombre_completo as nombre_profesor,
    p.email as email_profesor,
    p.estatus as estatus_profesor
FROM espacios e
INNER JOIN edificios ed ON e.id_edificio = ed.id_edificio
INNER JOIN cat_tipos_espacio t ON e.id_tipo = t.id_tipo
LEFT JOIN profesores p ON e.id_profesor_asignado = p.id_profesor;

-- ============================================
-- 9. ÍNDICES PARA OPTIMIZACIÓN
-- ============================================
-- Índice de texto completo para búsquedas
ALTER TABLE profesores ADD FULLTEXT INDEX idx_fulltext_nombre (nombre_completo);
ALTER TABLE espacios ADD FULLTEXT INDEX idx_fulltext_descriptivo (nombre_descriptivo);

-- ============================================
-- 10. TRIGGERS PARA AUDITORÍA
-- ============================================
DELIMITER //

CREATE TRIGGER before_update_edificio
BEFORE UPDATE ON edificios
FOR EACH ROW
BEGIN
    SET NEW.actualizado_en = CURRENT_TIMESTAMP;
END//

CREATE TRIGGER before_update_profesor
BEFORE UPDATE ON profesores
FOR EACH ROW
BEGIN
    SET NEW.actualizado_en = CURRENT_TIMESTAMP;
END//

CREATE TRIGGER before_update_espacio
BEFORE UPDATE ON espacios
FOR EACH ROW
BEGIN
    SET NEW.actualizado_en = CURRENT_TIMESTAMP;
END//

DELIMITER ;

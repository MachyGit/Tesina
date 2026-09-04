-- ============================================================
--  CAMPUS VIRTUAL PROA — Schema MySQL (XAMPP)
--  Ejecutar en phpMyAdmin o con: mysql -u root < schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS escuela_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE escuela_db;

-- ────────────────────────────────────────────────────────────
--  CURSOS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cursos (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  nombre   VARCHAR(50)  NOT NULL,            -- ej: "1ro"
  division VARCHAR(10)  NOT NULL,            -- ej: "A"
  turno    ENUM('mañana','tarde','noche') NOT NULL
);

-- ────────────────────────────────────────────────────────────
--  USUARIOS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                     INT AUTO_INCREMENT PRIMARY KEY,
  nombre                 VARCHAR(100) NOT NULL,
  email                  VARCHAR(100) NOT NULL UNIQUE,
  password               VARCHAR(255) NOT NULL,
  debe_cambiar_password  TINYINT(1) DEFAULT 0,  -- 1 = tiene que definir/cambiar su clave antes de poder usar el sistema
  rol                    ENUM('director','secretaria','preceptor','profesor','alumno') NOT NULL,
  curso_id               INT,
  foto                   LONGTEXT,                 -- base64
  telegram_id            VARCHAR(50) UNIQUE,       -- ID numérico de Telegram
  activo                 TINYINT(1) DEFAULT 1,     -- 0 = cuenta desactivada
  creado_por             INT,
  fecha_creacion         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (curso_id)   REFERENCES cursos(id) ON DELETE SET NULL,
  FOREIGN KEY (creado_por) REFERENCES users(id)  ON DELETE SET NULL
);

-- ────────────────────────────────────────────────────────────
--  TELEGRAM — tokens de vinculación
--  Flujo: el usuario genera un código en la web → lo manda al bot → queda vinculado
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_tokens (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT         NOT NULL UNIQUE,
  token      VARCHAR(64) NOT NULL UNIQUE,    -- código de 6 dígitos enviado por el usuario
  usado      TINYINT(1)  DEFAULT 0,
  creado_en  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
  expira_en  TIMESTAMP   NOT NULL,           -- 15 minutos de vida
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
--  CONTRASEÑAS — códigos de primer ingreso y enlaces de recuperación
--  tipo:
--    primer_login  → código de 6 dígitos que se manda al crear la cuenta
--                    (o lo genera un director/secretaria si el usuario
--                    perdió el acceso a su mail)
--    recuperacion  → token largo (hasheado) para el enlace de "olvidé mi
--                    contraseña", enviado al mail registrado del usuario
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS codigos_password (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  token         VARCHAR(255) NOT NULL,
  tipo          ENUM('primer_login','recuperacion') NOT NULL,
  generado_por  INT NULL,             -- id del director/secretaria, si el reseteo lo pidió un admin
  usado         TINYINT(1) DEFAULT 0,
  creado_en     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expira_en     TIMESTAMP NOT NULL,
  FOREIGN KEY (user_id)      REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (generado_por) REFERENCES users(id) ON DELETE SET NULL
);

-- ────────────────────────────────────────────────────────────
--  MATERIAS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materias (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  profesor_id INT,
  curso_id    INT,
  FOREIGN KEY (profesor_id) REFERENCES users(id)  ON DELETE SET NULL,
  FOREIGN KEY (curso_id)    REFERENCES cursos(id) ON DELETE SET NULL
);

-- ────────────────────────────────────────────────────────────
--  AVISOS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS avisos (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  titulo    VARCHAR(200) NOT NULL,
  contenido TEXT         NOT NULL,
  tipo      ENUM('general','tarea','horario','urgente') NOT NULL DEFAULT 'general',
  autor_id  INT          NOT NULL,
  curso_id  INT,                            -- NULL = para todos los cursos
  fecha     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (autor_id) REFERENCES users(id)  ON DELETE CASCADE,
  FOREIGN KEY (curso_id) REFERENCES cursos(id) ON DELETE SET NULL
);

-- ────────────────────────────────────────────────────────────
--  ASISTENCIA
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS asistencia (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  alumno_id    INT  NOT NULL,
  fecha        DATE NOT NULL,
  estado       ENUM('presente','ausente','tarde') NOT NULL,
  preceptor_id INT  NOT NULL,
  observacion  VARCHAR(255),
  UNIQUE KEY  uq_asistencia (alumno_id, fecha),   -- un registro por alumno por día
  FOREIGN KEY (alumno_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (preceptor_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
--  LOGS DE SESIÓN
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS session_logs (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT         NOT NULL,
  accion       VARCHAR(50) NOT NULL,        -- 'LOGIN', 'LOGOUT', 'TOKEN_INVALIDO', etc.
  ip           VARCHAR(45),
  user_agent   VARCHAR(255),
  hora         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
--  DATOS INICIALES
--  Director y secretaria por defecto (password: Admin1234!)
--  Hash generado con bcrypt rounds=10
-- ────────────────────────────────────────────────────────────
INSERT IGNORE INTO users (nombre, email, password, rol) VALUES
  ('Director', 'lenunez@escuelasproa.edu.ar',
   '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- Admin1234!
   'director'),
  ('Secretaria', 'stmachado@escuelasproa.edu.ar',
   '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- Admin1234!
   'secretaria');

-- ────────────────────────────────────────────────────────────
--  AÑOS ESCOLARES
--  Director y secretaria pueden crear/gestionar los años
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS anios (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  nombre   VARCHAR(20) NOT NULL,              -- ej: "1ero", "2do", "3ero"
  division VARCHAR(10) NOT NULL,              -- ej: "A", "B"
  turno    ENUM('mañana','tarde','noche') NOT NULL,
  activo   TINYINT(1) DEFAULT 1,
  creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_anio (nombre, division, turno)
);

-- ────────────────────────────────────────────────────────────
--  MATERIAS (asociadas a un año y un profesor)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS materias (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  anio_id     INT NOT NULL,
  profesor_id INT,
  creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (anio_id)     REFERENCES anios(id)  ON DELETE CASCADE,
  FOREIGN KEY (profesor_id) REFERENCES users(id)  ON DELETE SET NULL
);

-- ────────────────────────────────────────────────────────────
--  MENSAJES DE CHAT PRIVADO (tipo Google Chat / mail interno)
--  Solo staff: director, secretaria, preceptor, profesor
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mensajes (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  remitente_id INT NOT NULL,
  destinatario_id INT NOT NULL,
  contenido   TEXT,                           -- texto del mensaje (puede ser null si es solo archivo)
  leido       TINYINT(1) DEFAULT 0,
  enviado_en  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (remitente_id)    REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (destinatario_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ────────────────────────────────────────────────────────────
--  ARCHIVOS ADJUNTOS EN MENSAJES
--  Se guardan en el servidor en /uploads/chat/
--  En la DB solo guardamos la metadata y la ruta
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS archivos_chat (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  mensaje_id  INT NOT NULL,
  nombre_original VARCHAR(255) NOT NULL,      -- nombre que puso el usuario
  nombre_archivo  VARCHAR(255) NOT NULL,      -- nombre en disco (UUID + extensión)
  tipo_mime   VARCHAR(100),
  tamanio     INT,                            -- bytes
  FOREIGN KEY (mensaje_id) REFERENCES mensajes(id) ON DELETE CASCADE
);

-- Índices para acelerar la consulta de conversación entre dos usuarios
CREATE INDEX IF NOT EXISTS idx_mensajes_conv
  ON mensajes(remitente_id, destinatario_id, enviado_en);

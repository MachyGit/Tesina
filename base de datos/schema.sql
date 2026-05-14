CREATE DATABASE IF NOT EXISTS escuela_db;
USE escuela_db;

-- Cursos
CREATE TABLE cursos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL,
  division VARCHAR(10) NOT NULL,
  turno ENUM('mañana', 'tarde', 'noche') NOT NULL
);

-- Usuarios
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  rol ENUM('director', 'secretaria', 'preceptor', 'profesor', 'alumno') NOT NULL,
  curso_id INT,
  telegram_id VARCHAR(50),
  creado_por INT,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (curso_id) REFERENCES cursos(id)
);

-- Materias
CREATE TABLE materias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  profesor_id INT,
  curso_id INT,
  FOREIGN KEY (profesor_id) REFERENCES users(id),
  FOREIGN KEY (curso_id) REFERENCES cursos(id)
);

-- Avisos
CREATE TABLE avisos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  titulo VARCHAR(200) NOT NULL,
  contenido TEXT NOT NULL,
  tipo ENUM('general', 'tarea', 'horario', 'urgente') NOT NULL,
  autor_id INT NOT NULL,
  curso_id INT,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (autor_id) REFERENCES users(id),
  FOREIGN KEY (curso_id) REFERENCES cursos(id)
);

-- Asistencia
CREATE TABLE asistencia (
  id INT AUTO_INCREMENT PRIMARY KEY,
  alumno_id INT NOT NULL,
  fecha DATE NOT NULL,
  estado ENUM('presente', 'ausente', 'tarde') NOT NULL,
  preceptor_id INT NOT NULL,
  FOREIGN KEY (alumno_id) REFERENCES users(id),
  FOREIGN KEY (preceptor_id) REFERENCES users(id)
);

-- Logs de sesión
CREATE TABLE session_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  hora_ingreso TIMESTAMP,
  hora_egreso TIMESTAMP,
  accion VARCHAR(100),
  ip VARCHAR(50),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

// © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
// backend/config/migraciones.js
// Deja la base de datos lista para esta versión del Campus. Se ejecuta SOLA al
// arrancar el servidor (ver server.js), así no hay que correr SQL a mano.
//
// Es idempotente: se puede ejecutar mil veces, solo crea/agrega lo que falta.
// Funciona igual en MySQL y en MariaDB (XAMPP).
const pool = require('./db');

const existeColumna = async (tabla, columna) => {
  const [r] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabla, columna]
  );
  return r[0].n > 0;
};

const existeTabla = async (tabla) => {
  const [r] = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tabla]
  );
  return r[0].n > 0;
};

// Agrega una columna solo si todavía no existe.
const agregarColumna = async (tabla, columna, definicion) => {
  if (await existeColumna(tabla, columna)) return false;
  await pool.query(`ALTER TABLE \`${tabla}\` ADD COLUMN \`${columna}\` ${definicion}`);
  console.log(`🛠  Migración: ${tabla}.${columna} agregada`);
  return true;
};

const paso = async (descripcion, fn) => {
  try {
    await fn();
  } catch (err) {
    console.error(`❌ Migración "${descripcion}" falló: ${err.message}`);
  }
};

exports.asegurarEsquema = async () => {
  // ── 0. Años y materias (por si se importó un schema viejo) ───────────────────
  await paso('tabla anios', async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS anios (
        id        INT AUTO_INCREMENT PRIMARY KEY,
        nombre    VARCHAR(20) NOT NULL,
        division  VARCHAR(10) NOT NULL DEFAULT '',
        turno     VARCHAR(20) NOT NULL DEFAULT '',
        activo    TINYINT(1) DEFAULT 1,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_anio (nombre, division, turno)
      )`);
  });

  // PROA tiene un solo turno y una sola división: las columnas quedan opcionales
  // (no se borran para no perder datos) y ya no se muestran en ningún lado.
  await paso('anios sin división/turno', async () => {
    await pool.query("ALTER TABLE anios MODIFY division VARCHAR(10) NOT NULL DEFAULT ''");
    await pool.query("ALTER TABLE anios MODIFY turno VARCHAR(20) NOT NULL DEFAULT ''");
  });

  // El schema.sql viejo definía "materias" dos veces y MySQL se quedaba con la
  // primera (con curso_id, sin anio_id). Eso rompía listar años y crear materias.
  await paso('tabla materias', async () => {
    if (!(await existeTabla('materias'))) {
      await pool.query(`
        CREATE TABLE materias (
          id          INT AUTO_INCREMENT PRIMARY KEY,
          nombre      VARCHAR(100) NOT NULL,
          anio_id     INT NOT NULL,
          profesor_id INT,
          creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (anio_id)     REFERENCES anios(id) ON DELETE CASCADE,
          FOREIGN KEY (profesor_id) REFERENCES users(id) ON DELETE SET NULL
        )`);
      return;
    }
    if (await existeColumna('materias', 'anio_id')) return;

    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM materias');
    if (n === 0) {
      await pool.query('DROP TABLE materias');
      await pool.query(`
        CREATE TABLE materias (
          id          INT AUTO_INCREMENT PRIMARY KEY,
          nombre      VARCHAR(100) NOT NULL,
          anio_id     INT NOT NULL,
          profesor_id INT,
          creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (anio_id)     REFERENCES anios(id) ON DELETE CASCADE,
          FOREIGN KEY (profesor_id) REFERENCES users(id) ON DELETE SET NULL
        )`);
      console.log('🛠  Migración: tabla materias recreada con anio_id (estaba vacía)');
    } else {
      // Tiene datos: no se borra nada. Se agrega la columna que falta.
      await agregarColumna('materias', 'anio_id', 'INT NULL');
      await agregarColumna('materias', 'creado_en', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
      console.warn('⚠️  materias tenía datos sin anio_id: asignales un año desde el panel.');
    }
  });

  // ── 1. Usuarios: año del alumno + cuentas pendientes de aprobación ───────────
  await paso('users.anio_id', async () => {
    const nueva = await agregarColumna('users', 'anio_id', 'INT NULL');
    if (nueva) {
      await pool.query(
        `ALTER TABLE users ADD CONSTRAINT fk_users_anio
         FOREIGN KEY (anio_id) REFERENCES anios(id) ON DELETE SET NULL`
      );
    }
  });
  await paso('users.pendiente', async () => {
    await agregarColumna('users', 'pendiente', 'TINYINT(1) NOT NULL DEFAULT 0');
  });

  // ── 2. Avisos: año destino + fecha de la actividad (para el calendario) ──────
  await paso('avisos.anio_id', async () => {
    const nueva = await agregarColumna('avisos', 'anio_id', 'INT NULL');
    if (nueva) {
      await pool.query(
        `ALTER TABLE avisos ADD CONSTRAINT fk_avisos_anio
         FOREIGN KEY (anio_id) REFERENCES anios(id) ON DELETE CASCADE`
      );
    }
  });
  await paso('avisos.fecha_evento', async () => {
    await agregarColumna('avisos', 'fecha_evento', 'DATETIME NULL');
    await agregarColumna('avisos', 'todo_el_dia', 'TINYINT(1) NOT NULL DEFAULT 0');
  });

  // ── 2b. Avisos/tareas dentro de una materia (vista tipo Classroom) ───────────
  await paso('avisos.materia_id', async () => {
    const nueva = await agregarColumna('avisos', 'materia_id', 'INT NULL');
    if (nueva) {
      await pool.query(
        `ALTER TABLE avisos ADD CONSTRAINT fk_avisos_materia
         FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE`
      );
    }
  });

  // ── 2c. Calendario (exámenes, reuniones, feriados, entregas, etc.) ───────────
  await paso('tabla eventos', async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS eventos (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        titulo      VARCHAR(200) NOT NULL,
        descripcion TEXT NULL,
        tipo        VARCHAR(20) NOT NULL DEFAULT 'evento',
        fecha       DATE NOT NULL,
        hora        TIME NULL,
        anio_id     INT NULL,
        materia_id  INT NULL,
        autor_id    INT NOT NULL,
        creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_eventos_fecha (fecha),
        FOREIGN KEY (anio_id)    REFERENCES anios(id)    ON DELETE CASCADE,
        FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE,
        FOREIGN KEY (autor_id)   REFERENCES users(id)    ON DELETE CASCADE
      )`);
  });

  // ── 2d. Horarios de clase (grilla semanal por año) ───────────────────────────
  await paso('tabla horarios', async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS horarios (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        anio_id     INT NOT NULL,
        materia_id  INT NULL,
        titulo      VARCHAR(100) NULL,
        dia         TINYINT NOT NULL,
        hora_inicio TIME NOT NULL,
        hora_fin    TIME NOT NULL,
        aula        VARCHAR(50) NULL,
        creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_horarios_anio (anio_id, dia),
        FOREIGN KEY (anio_id)    REFERENCES anios(id)    ON DELETE CASCADE,
        FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE CASCADE
      )`);
  });

  // ── 2e. Mensajes: id del cliente (para no duplicar si se reintenta un envío sin conexión) ──
  await paso('mensajes.client_id', async () => {
    const nueva = await agregarColumna('mensajes', 'client_id', 'VARCHAR(40) NULL');
    if (nueva) {
      await pool.query('ALTER TABLE mensajes ADD UNIQUE KEY uq_mensaje_cliente (remitente_id, client_id)');
    }
  });

  // ── 2f. Mensajes: "borrar para mí" (oculto solo para quien lo pidió, como WhatsApp) ──
  await paso('mensajes.oculto', async () => {
    await agregarColumna('mensajes', 'oculto_remitente', 'TINYINT(1) NOT NULL DEFAULT 0');
    await agregarColumna('mensajes', 'oculto_destinatario', 'TINYINT(1) NOT NULL DEFAULT 0');
  });

  // ── 2g. Pase de año y egresados ──────────────────────────────────────────────
  //  anios.tipo   'escolar' (1ro, 2do…) | 'promocion' (egresados: "Promoción 2026")
  //  anios.orden  posición para saber a qué año pasa cada uno
  //  users.situacion 'regular' | 'egresado' | 'ex_alumno' (se fue del colegio; conserva su cuenta)
  await paso('anios.tipo/orden', async () => {
    await agregarColumna('anios', 'tipo', "VARCHAR(12) NOT NULL DEFAULT 'escolar'");
    await agregarColumna('anios', 'orden', 'INT NOT NULL DEFAULT 0');
    // Los años escolares sin orden toman el número de su nombre ("3ro" → 3); si no tiene número, su id.
    const [sinOrden] = await pool.query("SELECT id, nombre FROM anios WHERE tipo = 'escolar' AND orden = 0");
    for (const a of sinOrden) {
      const m = String(a.nombre).match(/\d+/);
      await pool.query('UPDATE anios SET orden = ? WHERE id = ?', [m ? parseInt(m[0], 10) : a.id, a.id]);
    }
  });
  await paso('users.situacion', async () => {
    await agregarColumna('users', 'situacion', "VARCHAR(12) NOT NULL DEFAULT 'regular'");
    await agregarColumna('users', 'egresado_en', 'DATE NULL');
  });

  // ── 2h. Grupos de chat ───────────────────────────────────────────────────────
  await paso('tablas de grupos de chat', async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_grupos (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        nombre     VARCHAR(80) NOT NULL,
        creador_id INT NOT NULL,
        creado_en  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (creador_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_grupo_miembros (
        grupo_id      INT NOT NULL,
        user_id       INT NOT NULL,
        es_admin      TINYINT(1) NOT NULL DEFAULT 0,
        ultimo_leido  INT NOT NULL DEFAULT 0,
        unido_en      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (grupo_id, user_id),
        FOREIGN KEY (grupo_id) REFERENCES chat_grupos(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id)  REFERENCES users(id)       ON DELETE CASCADE
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_grupo_mensajes (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        grupo_id     INT NOT NULL,
        remitente_id INT NOT NULL,
        contenido    TEXT NOT NULL,
        client_id    VARCHAR(40) NULL,
        sistema      TINYINT(1) NOT NULL DEFAULT 0,
        enviado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_gm_grupo (grupo_id, id),
        UNIQUE KEY uq_gm_cliente (remitente_id, client_id),
        FOREIGN KEY (grupo_id)     REFERENCES chat_grupos(id) ON DELETE CASCADE,
        FOREIGN KEY (remitente_id) REFERENCES users(id)       ON DELETE CASCADE
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_grupo_ocultos (
        mensaje_id INT NOT NULL,
        user_id    INT NOT NULL,
        PRIMARY KEY (mensaje_id, user_id),
        FOREIGN KEY (mensaje_id) REFERENCES chat_grupo_mensajes(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id)    REFERENCES users(id)               ON DELETE CASCADE
      )`);
  });

  // ── 3. Asistencia: cómo y a qué hora se registró ─────────────────────────────
  await paso('asistencia.origen', async () => {
    await agregarColumna('asistencia', 'origen', "ENUM('manual','qr') NOT NULL DEFAULT 'manual'");
    await agregarColumna('asistencia', 'hora_registro', 'TIME NULL');
  });

  // ── 4. Archivos del aula (material de estudio, guías, etc.) ──────────────────
  await paso('tabla archivos_aula', async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS archivos_aula (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        nombre_original VARCHAR(255) NOT NULL,
        nombre_archivo  VARCHAR(255) NOT NULL,
        tipo_mime       VARCHAR(100),
        tamanio         INT,
        descripcion     VARCHAR(255),
        anio_id         INT NULL,
        materia_id      INT NULL,
        subido_por      INT NOT NULL,
        creado_en       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (anio_id)    REFERENCES anios(id)    ON DELETE CASCADE,
        FOREIGN KEY (materia_id) REFERENCES materias(id) ON DELETE SET NULL,
        FOREIGN KEY (subido_por) REFERENCES users(id)    ON DELETE CASCADE
      )`);
  });

  // ── 5. Anuncios de la clase: archivos adjuntos y comentarios ─────────────────
  await paso('archivos_aula.aviso_id', async () => {
    const nueva = await agregarColumna('archivos_aula', 'aviso_id', 'INT NULL');
    if (nueva) {
      await pool.query(
        `ALTER TABLE archivos_aula ADD CONSTRAINT fk_archivos_aviso
         FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE CASCADE`
      );
    }
  });
  await paso('tabla aviso_comentarios', async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS aviso_comentarios (
        id        INT AUTO_INCREMENT PRIMARY KEY,
        aviso_id  INT NOT NULL,
        autor_id  INT NOT NULL,
        contenido VARCHAR(1000) NOT NULL,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (aviso_id) REFERENCES avisos(id) ON DELETE CASCADE,
        FOREIGN KEY (autor_id) REFERENCES users(id)  ON DELETE CASCADE
      )`);
  });
};

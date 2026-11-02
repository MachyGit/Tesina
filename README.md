# Campus Virtual PROA — v2.0

## ⚙️ Instalación paso a paso

### 1. Base de datos (XAMPP)
1. Abrí XAMPP y activá **Apache** y **MySQL**
2. Abrí `http://localhost/phpmyadmin`
3. Click en **Importar** → seleccioná `base de datos/schema.sql`
4. Click en **Continuar**

✅ Listo. Se crea la base `escuela_db` con las tablas y los usuarios iniciales.

**Usuarios por defecto:**
| Email | Password | Rol |
|---|---|---|
| lenunez@escuelasproa.edu.ar | password | director |
| stmachado@escuelasproa.edu.ar | password | secretaria |

> ⚠️ Cambiá esa contraseña apenas ingreses (menú de perfil → Contraseña).

**¿"Credenciales incorrectas" con `Admin1234!`?** Los usuarios iniciales se crean con la clave `password`. Si la cambiaste y la olvidaste (o querés dejar otra), restablecela sin tocar los demás datos, desde la carpeta raíz:
```bash
npm run reset-password -- lenunez@escuelasproa.edu.ar MiClaveNueva123
# sin clave, genera una al azar y la muestra:   npm run reset-password
# solo comprobar si una clave coincide:         node backend/scripts/restablecer-password.js --verificar correo@x.com MiClave
```

---

### 2. Backend (Node.js)
```bash
# En la carpeta raíz del proyecto
cp .env.example .env
# Editá el .env si tu MySQL tiene contraseña (por defecto XAMPP no tiene)

npm install      # instala también qrcode y multer (QR y archivos)
npm run dev   # desarrollo con nodemon
# o
npm start     # producción
```

El servidor arranca en `http://localhost:5000`

---

### 3. Bot de Telegram
```bash
cd telegram-bot
cp .env.example .env
# Completá TELEGRAM_TOKEN y GEMINI_API_KEY en el .env

pip install -r requirements.txt
python bot.py
```

---

## 🔗 Vincular Telegram con el campus

1. El usuario inicia sesión en el campus web
2. Va a su perfil → botón **"Vincular Telegram"**
3. El backend genera un código de 6 dígitos (válido 15 min)
4. El usuario abre el bot en Telegram y manda: `/vincular 123456`
5. El bot confirma la vinculación

---

## 📡 Endpoints de la API

### Auth
| Método | Ruta | Acceso |
|---|---|---|
| POST | `/api/auth/login` | Público |
| POST | `/api/auth/logout` | Autenticado |

### Usuarios
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/users/perfil` | Autenticado |
| PUT | `/api/users/foto` | Autenticado |
| POST | `/api/users/telegram-token` | Autenticado |
| GET | `/api/users` | director/secretaria |
| POST | `/api/users` | director/secretaria |
| PUT | `/api/users/rol` | director/secretaria |
| PUT | `/api/users/:id/toggle-activo` | director/secretaria |
| POST | `/api/users/:id/ex-alumno` | director/secretaria |
| GET | `/api/users?situacion=egresado\|ex_alumno\|no_regular` | director/secretaria |

### Avisos
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/avisos` | Autenticado |
| POST | `/api/avisos` | director/secretaria/preceptor/profesor |
| DELETE | `/api/avisos/:id` | Autor o director |
| POST | `/api/avisos/bot` | Bot (X-Bot-Secret) |

### Materias y calendario
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/anios/mis-materias` | Autenticado (según rol) |
| GET | `/api/anios/materias/:id` | Autenticado (alumno: solo su año) |
| GET | `/api/calendario?desde=&hasta=` | Autenticado (alumno: solo su año) |
| POST | `/api/calendario` | director/secretaria/preceptor/profesor |
| DELETE | `/api/calendario/:id` | Autor o director/secretaria |

### Años: renombrar y pase de año
| Método | Ruta | Acceso |
|---|---|---|
| PUT | `/api/anios/:id` (renombrar) | director/secretaria |
| GET | `/api/anios/pase/vista-previa` | director/secretaria |
| POST | `/api/anios/pase` `{promocion_nombre, excluir[], confirmar:"PASAR"}` | director/secretaria |
| GET | `/api/anios?incluir_promociones=1` | director/secretaria |

### Grupos de chat
| Método | Ruta |
|---|---|
| GET/POST | `/api/chat/grupos` |
| GET/PUT/DELETE | `/api/chat/grupos/:id` |
| POST / DELETE | `/api/chat/grupos/:id/miembros` · `/miembros/:userId` |
| GET/POST | `/api/chat/grupos/:id/mensajes` · `/mensaje` |
| DELETE / POST | `/api/chat/grupos/:id/mensaje/:mid?modo=mi\|todos` · `/borrar-varios` |

### Horarios
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/horarios?anio_id=` | Autenticado (alumno: su año · profesor: `?mios=1`) |
| POST | `/api/horarios` | director/secretaria |
| DELETE | `/api/horarios/:id` | director/secretaria |

### Asistencia
| Método | Ruta | Acceso |
|---|---|---|
| POST | `/api/asistencia` | preceptor |
| GET | `/api/asistencia/alumno/:id` | Todos excepto alumno ajeno |
| GET | `/api/asistencia/curso/:id` | director/secretaria/preceptor |
| GET | `/api/asistencia/bot` | Bot (X-Bot-Secret) |

### Telegram
| Método | Ruta | Acceso |
|---|---|---|
| POST | `/api/telegram/vincular` | Bot (X-Bot-Secret) |
| GET | `/api/telegram/verificar` | Bot (X-Bot-Secret) |

### Logs
| Método | Ruta | Acceso |
|---|---|---|
| GET | `/api/logs` | director/secretaria |

---

## 🔐 Seguridad implementada

- **JWT** en cada request autenticado (header `Authorization: Bearer <token>`)
- **Roles** verificados en cada endpoint
- **Rate limiting**: 10 intentos de login por IP cada 15 min, 200 req generales
- **Helmet**: headers de seguridad HTTP
- **bcrypt** rounds=10 para contraseñas
- **BOT_SECRET**: clave compartida entre el backend y el bot para endpoints del bot
- **Verificación de cuenta activa** en cada request (no solo en el login)
- **Logs** de login, logout e intentos fallidos

---

## 🤖 Comandos del bot

| Comando | Descripción | Roles |
|---|---|---|
| `/start` | Bienvenida y menú | Todos |
| `/vincular <código>` | Vincular cuenta Telegram | Todos |
| `/ver` | Ver últimos 5 avisos | Todos |
| `/aviso <texto>` | Publicar aviso general | Staff |
| `/tarea <texto>` | Publicar tarea | Staff |
| `/horario <texto>` | Publicar cambio de horario | Staff |
| `/urgente <texto>` | Publicar aviso urgente | Staff |
| `/asistencia <nombre>` | Ver asistencia de un alumno | Staff |
| Texto libre | Consulta a la IA (Gemini) | Todos |

---

## 👥 Equipo
- Leandro Nuñez
- Santiago Vigna
- Santiago Machado


---

## 🆕 Novedades

- **Años simples**: PROA tiene un solo turno y una sola división, así que el año es solo "1ro", "2do"… (ya no se pide división ni turno). Los años viejos se conservan: se muestran solo con su nombre.
- **Materias tipo Classroom**: pestaña *Materias*. Cada materia es una clase con **Tablón** (anuncios y tareas con fecha), **Material** (archivos), **Calendario** y **Personas**. Alumno: ve las de su año. Profesor: las que dicta. Director/secretaría/preceptor: todas. Desde *Años y materias* → "Abrir clase".
- **Calendario tipo Moodle**: pestaña *Calendario* con vista mensual. Junta los eventos anotados (examen, entrega, reunión, feriado, acto) con los avisos que tienen fecha. Cada uno ve solo lo de su año y lo general. Anotan: director, secretaría, preceptor y profesor (este último solo en sus años/materias).
- **Horarios**: pestaña *Horarios* con la grilla semanal (lunes a viernes, sábado si se usa) por año: hora, materia, profesor y aula; el día de hoy se resalta. Director y secretaría los arman (se avisa si dos horarios se superponen y se pueden cargar recreos u horas libres). El alumno ve el de su año; el profesor ve "Mis clases" de todos sus años.
- **Modo sin conexión**: si se cae internet o el wifi, lo que se hace queda guardado en el dispositivo y se envía solo al volver la conexión (también cuando se recarga la página). Un cartel arriba avisa "Sin conexión" y cuántos pendientes hay (*Ver pendientes* para revisarlos o quitarlos).
  - **Asistencia** (director/secretaría/preceptor): se puede seguir marcando P/T/A; la fila queda con 🕐 hasta que se sube, con la fecha y hora reales en que se marcó. Para poder hacerlo sin conexión, la lista del año tiene que haberse abierto antes con internet (al entrar a *Asistencia* se guardan solas las listas de hoy de todos los años).
  - **Mensajes**: sin internet el mensaje queda con 🕐 "Sin enviar" y sale solo después, una única vez (no se duplica). Los mensajes sin enviar se pueden borrar. Los archivos adjuntos sí necesitan internet.
  - **Borrar mensajes (como WhatsApp)**: cada mensaje tiene 🗑 y pregunta **Borrar para mí** (se oculta solo en tu cuenta; sirve también para mensajes recibidos) o **Borrar para todos** (solo tus propios mensajes; desaparece en vivo para el otro). El botón **🗑 Borrar mensajes** de la cabecera permite tildar varios, *Todos* o *Vaciar conversación* (para mí = toda la conversación de tu cuenta; para todos = tus mensajes).
  - **Abrir la app sin internet**: un *service worker* guarda las páginas para que el campus abra igual (funciona en `localhost` y con https, por ejemplo el túnel; con `http://192.168.x.x` los navegadores no lo permiten).
  - Límite: el **QR de asistencia del alumno necesita internet** (el código vence a los segundos y el celular tiene que llegar al servidor); si no puede, el preceptor lo marca a mano.
- **Grupos de chat**: en *Mensajes* → ➕ Nuevo (solo personal; los alumnos no usan el chat). Se elige el nombre y las personas. Quien lo crea es administrador/a: puede renombrar, agregar o quitar gente y eliminar el grupo; cualquiera puede salir. Mensajes de texto en vivo, autor visible, no leídos y avisos del sistema ("X agregó a Y"). Funciona el borrado "para mí / para todos" (en grupos "para todos" lo puede hacer el autor o un admin) y el modo sin conexión.
- **Renombrar años**: *Años y materias* → ✏️ Renombrar (nombre libre: "1ro", "1er año"…).
- **Pasar de año** (fin de ciclo): *Años y materias* → 🎓 Pasar de año. Cada alumno pasa al año siguiente (por orden), los del último año egresan a una **Promoción** (ej. "Promoción 2026") y el primer año queda libre para los ingresantes. Se puede tildar a quienes **repiten**. Pide escribir PASAR para confirmar y queda en *Actividad*.
- **Egresados y ex alumnos**: nadie pierde la cuenta. Los egresados quedan en su promoción; 🚪 *Se fue* (en *Usuarios*) marca a quien dejó la escuela. Pestaña *Egresados* (director/secretaría): buscar, filtrar por promoción y ↩️ Reincorporar a un año. Ellos entran igual al campus con un panel reducido (inicio, avisos, archivos); no registran asistencia ni aparecen en listas.
- **Tablón estilo Classroom**: en cada materia, *Nuevo anuncio* (con archivos adjuntos y fecha opcional). Las tarjetas muestran autor, fecha, texto, adjuntos y "Agregar un comentario de clase"; al tocar una se abre el anuncio con sus archivos y los **comentarios de clase** (los ven y escriben profesor y alumnos del año; el autor o dirección/secretaría pueden borrar). Endpoints: `GET /api/avisos/:id`, `POST /api/avisos/:id/comentarios`, `DELETE /api/avisos/comentarios/:cid`, y `aviso_id` al subir archivos.
- **Hora de ingreso**: como hay un solo turno, ahora es `HORA_INGRESO=08:00` en el `.env` (reemplaza a `HORARIOS_INGRESO`).

- **Archivos del aula**: pestaña *Archivos* (suben director, secretaría, preceptor y profesor; el alumno solo descarga lo de su año).
- **Asistencia por QR**: pestaña *Asistencia* → QR que cambia solo. El alumno lo escanea con la cámara del celular y queda presente/tarde según la hora de ingreso. Para que el celular lo abra, entrá al campus por la IP de la PC (ej. `http://192.168.1.50:3000`) o definí `FRONTEND_PUBLIC_URL` en el `.env`. Hora límite: `HORA_INGRESO` (ej. `08:00`).
- **Años**: cada alumno pertenece a un año y solo ve avisos, archivos y materias del suyo (se controla en el servidor, no solo en pantalla). Se cambia en *Usuarios*.
- **Cuentas**: los alumnos se registran solos y quedan *pendientes* hasta que dirección/secretaría las aprueba.
- **Foto de perfil** para todos; dirección/secretaría pueden quitar una foto indebida (*Usuarios* → 🚫 Foto).
- **Recuperar contraseña**: “¿Olvidaste tu contraseña?” envía un enlace al mail (vale 1 hora).
- **Calendario**: un aviso tipo *Actividad* con fecha muestra “Agregar a Google Calendar”, permite bajar el `.ics` y, si se tilda, manda una invitación de calendario por mail a los alumnos del año.
- **Chat**: mensajes en vivo entre el personal, con archivos y avisos de no leídos.

### Mail
Completá `MAIL_USER` y `MAIL_PASS` (contraseña de aplicación de Gmail) o `MAIL_HOST` (SMTP) en el `.env`. Sin eso el servidor entra en *modo prueba*: imprime los mails (enlaces y códigos) en la consola y, al crear usuarios, muestra el código en pantalla.

---

## 🌐 Compartir el campus para que lo pruebe otra persona (túnel)

El backend también sirve las páginas, así que con **un solo enlace** alcanza:

1. Encendé XAMPP (MySQL) y el backend: `npm run dev`.
2. Probalo vos en `http://localhost:5000/login.html`.
3. Instalá Cloudflare Tunnel (una vez, no pide cuenta): `winget install --id Cloudflare.cloudflared`
4. En otra terminal: `cloudflared tunnel --url http://localhost:5000`
5. Te muestra un enlace `https://algo-aleatorio.trycloudflare.com`. Pasale **ese enlace + /login.html** a tu compañero. Funciona desde el celular y con cualquier internet.
6. Para el QR de asistencia: abrí el campus en la PC con ese mismo enlace (no con localhost) y generalo desde ahí.

Mientras el túnel esté abierto, cualquiera que tenga el enlace puede intentar entrar: usá contraseñas propias (no `password`) y cerralo con `Ctrl + C` cuando termine la prueba. El enlace cambia cada vez. La PC tiene que seguir encendida.

## ©️ Autoría
Campus Virtual PROA © 2026 — Pito, Santiago Vigna y Santiago Machado. Todos los derechos reservados (ver `LICENSE`).
La firma se define en `backend/config/autoria.js` y el servidor la agrega a **todas** las páginas (pie, metadatos y comentario HTML), a cada respuesta (`X-Autoria`), a la consola, a los Excel exportados y a los encabezados de los archivos de código. Borrarla del frontend no la saca: se vuelve a inyectar.

## 📟 Avisos de autoría a tu Telegram
El servidor puede avisarte a VOS (no a la escuela) si algo pasa con la firma de autoría. Nunca bloquea ni apaga el campus: solo avisa.

1. En el `.env`, completá `ALERTA_TG_TOKEN` (el token del bot de @BotFather) y `ALERTA_TG_CHAT_ID` (tu chat_id: hablale al bot o usá @userinfobot).
2. **Candado de integridad**: `backend/config/autoria.lock.json` guarda un hash de `server.js`, `backend/middleware/autoria.js` y `backend/config/autoria.js`. Al arrancar (y cada 6 horas mientras el servidor sigue corriendo) se recalcula y se compara. Si no coincide, te llega un Telegram de alerta.
3. Después de **vos** cambiar a propósito esos archivos (por ejemplo, completar los apellidos), corré `npm run firmar` para actualizar el candado — si no, te vas a avisar a vos mismo por tu propio cambio.
4. **"Sigo vivo"**: `npm run latido` manda un mensaje de confirmación. Programalo por cron en el servidor donde corra el campus (ej. cada 6 horas); si un día dejás de recibirlo, el servidor se apagó o perdiste el acceso.

**Límite honesto**: esto detecta cambios en el código mientras el servidor sigue corriendo. Si alguien directamente da de baja el servidor, borra el repositorio o te saca el acceso al hosting, no hay forma de que el propio sistema te avise (ya no está corriendo). Para eso sirve el "sigo vivo": la ausencia de aviso es, en sí, la alerta.


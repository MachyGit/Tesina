<h1 align="center"> Tesina – Página Web Escolar PROA</h1>

<p align="center">
Plataforma web escolar desarrollada como proyecto institucional.
</p>

<p align="center">
<img src="https://img.shields.io/badge/Estado-En%20desarrollo-yellow">
<img src="https://img.shields.io/badge/Tecnologías-HTML%20CSS%20JavaScript-blue">
<img src="https://img.shields.io/badge/Tipo-Proyecto%20Escolar-green">
</p>

<hr>

<h2>📖 Descripción del Proyecto</h2>

<p>
Este proyecto consiste en el desarrollo de una <b>plataforma web institucional para una escuela PROA</b>.
</p>

<p>
El objetivo es crear un <b>portal escolar centralizado</b> donde estudiantes y docentes puedan acceder a información académica, anuncios, horarios y recursos educativos.
</p>

<hr>

<h2>🎯 Objetivos</h2>

<h3>Objetivo General</h3>

<p>
Desarrollar una plataforma web escolar moderna que facilite el acceso a información académica y mejore la comunicación dentro de la institución.
</p>

<h3>Objetivos Específicos</h3>

<ul>
<li>Centralizar la información institucional</li>
<li>Organizar anuncios por curso</li>
<li>Permitir acceso mediante inicio de sesión</li>
<li>Mostrar horarios escolares</li>
<li>Crear un campus virtual educativo</li>
<li>Incorporar herramientas de asistencia virtual</li>
</ul>

<hr>

<h2>⚙️ Funcionalidades</h2>

<h3> Página de inicio</h3>

<ul>
<li>Noticias y novedades</li>
<li>Información institucional</li>
<li>Acceso rápido a secciones</li>
<li>Acceso al campus virtual</li>
</ul>

<h3> Sistema de inicio de sesión</h3>

<p>
Los usuarios podrán iniciar sesión según su rol:
</p>

<ul>
<li>Alumno</li>
<li>Docente</li>
<li>Administrador</li>
</ul>

<h3>Anuncios por curso</h3>

<p>
Cada curso contará con su propio espacio de anuncios donde se publicarán avisos académicos e institucionales.
</p>

<ul>
<li>Fechas de exámenes</li>
<li>Comunicados docentes</li>
<li>Actividades escolares</li>
<li>Avisos importantes</li>
</ul>

<h3>Campus Virtual</h3>

<ul>
<li>Material de estudio</li>
<li>Documentos descargables</li>
<li>Recursos educativos</li>
<li>Contenido académico</li>
</ul>

<h3> Horarios escolares</h3>

<ul>
<li>Horarios por curso</li>
<li>Materias del día</li>
<li>Profesores asignados</li>
</ul>

<hr>

<h2>🤖 Asistente Virtual</h2>

<p>
La plataforma contará con un <b>asistente virtual integrado en la página web</b> que permitirá a los usuarios realizar consultas rápidas sobre:
</p>

<ul>
<li>Horarios escolares</li>
<li>Anuncios del curso</li>
<li>Información institucional</li>
<li>Acceso al campus virtual</li>
<li>Dudas frecuentes de estudiantes</li>
</ul>

<p>
El asistente facilitará la navegación dentro del sitio y ayudará a los usuarios a encontrar información de forma rápida e intuitiva.
</p>

<hr>

<h2> Bot de Telegram</h2>

<p>
Además de la página web, el proyecto incluirá un <b>bot de Telegram</b> que replicará algunas de las funciones principales del sitio.
</p>

<p>
Esto permitirá a los usuarios realizar consultas sin necesidad de ingresar manualmente a la página web.
</p>

<p>
Entre sus funciones principales estarán:
</p>

<ul>
<li>Consultar horarios escolares</li>
<li>Ver anuncios del curso</li>
<li>Recibir avisos importantes</li>
<li>Acceder a enlaces del campus virtual</li>
<li>Realizar consultas rápidas mediante comandos</li>
</ul>

<p>
De esta forma, los estudiantes podrán acceder a la información de la escuela de forma más rápida y desde cualquier dispositivo.
</p>

<hr>

<h2>Tecnologías utilizadas</h2>

<ul>
<li>HTML</li>
<li>CSS</li>
<li>JavaScript</li>
<li>Git / GitHub</li>
<li>Integración con APIs</li>
<li>Bot de Telegram</li>
</ul>

<hr>

<h2> Estructura del Proyecto</h2>

<pre>
ProApp/
│
├──  backend/                          # Node.js + Express
│   ├──  config/
│   │   └── db.js                        # Conexión MySQL
│   ├──  controllers/
│   │   ├── authController.js            # Login / Logout
│   │   ├── userController.js            # Crear usuarios, asignar roles
│   │   ├── avisoController.js           # CRUD de avisos
│   │   ├── asistenciaController.js      # Registrar asistencia
│   │   └── logController.js             # Ver logs de sesión
│   ├──  middleware/
│   │   ├── authMiddleware.js            # Verificar JWT + roles
│   │   └── sessionLogger.js            # Registrar acciones
│   ├──  models/
│   │   ├── User.js
│   │   └── Aviso.js
│   ├──  routes/
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── avisos.js
│   │   ├── asistencia.js
│   │   └── logs.js
│   ├──  telegram/                     # Endpoint para recibir avisos del bot
│   ├──  logs/                         # Logs del servidor
│   ├── server.js                        # Entrada principal
│   ├── package.json
│   └── .env.example
│
├──  frontend-web/                     # React + Tailwind CSS
│   ├──  public/
│   │   └── images/                  # Fotos de la escuela
│   └──  src/
│       ├──  pages/
│       │   ├── Home.jsx                 # Página pública principal
│       │   ├── Login.jsx                # Campus virtual - inicio sesión
│       │   └──  Dashboard/
│       │       ├── Dashboard.jsx        # Enruta según el rol
│       │       ├── Director.jsx
│       │       ├── Secretaria.jsx
│       │       ├── Preceptor.jsx
│       │       ├── Profesor.jsx
│       │       └── Alumno.jsx
│       ├── components/
│       │   ├──  Navbar/
│       │   │   └── Navbar.jsx
│       │   ├──  Avisos/
│       │   │   └── AvisoCard.jsx
│       │   ├──  Asistencia/
│       │   │   └── AsistenciaForm.jsx
│       │   └──  Asistente/
│       │       ├── AsistenteButton.jsx  # Botón flotante
│       │       └── AsistenteChat.jsx    # Ventana del chat IA
│       ├──  context/
│       │   └── AuthContext.jsx          # Estado global del usuario
│       ├──  services/
│       │   └── api.js                   # Axios + interceptores JWT
│       ├──  hooks/                    # Custom hooks
│       └── App.jsx                      # Rutas principales
│
├──  frontend-mobile/                  # React Native + Expo
│   ├──  app/
│   │   ├── index.jsx                    # Redirige según sesión
│   │   ├──  auth/
│   │   │   └── login.jsx
│   │   └──  dashboard/
│   │       ├── director.jsx
│   │       ├── secretaria.jsx
│   │       ├── preceptor.jsx
│   │       ├── profesor.jsx
│   │       └── alumno.jsx
│   ├──  components/
│   │   ├── AvisoCard.jsx
│   │   ├── HorarioTable.jsx
│   │   └── AsistenciaItem.jsx
│   ├──  services/
│   │   └── api.js                       # Mismo backend, token con SecureStore
│   ├──  hooks/
│   └──  assets/
│
├──  telegram-bot/                     # Python + Telebot
│   ├── bot.py                           # Entrada principal
│   ├── commands.py                      # /aviso /tarea /horario /urgente /ver
│   ├── auth.py                          # Verifica Telegram ID autorizado
│   ├── requirements.txt
│   └── .env.example
│
├── database/
│  └── schema.sql                       # Tablas: users, cursos, avisos, asistencia, logs

</pre>

<hr>

<h2> Futuras Mejoras </h2>

<ul>
<li>Sistema de notificaciones</li>
<li>Aplicación móvil</li>
<li>Entrega de trabajos prácticos</li>
<li>Panel de administración</li>
<li>Chat entre alumnos y docentes</li>
<li>Mejoras en el asistente virtual</li>
</ul>

<hr>
<h2>👥 Integrantes del equipo</h2>

<ul>
<li>Leandro Nuñez</li>
<li>Santiago Vigna</li>
<li>Santiago Machado</li>
</ul>

<h2>📌 Estado del proyecto</h2>

<p>
🔴⏳ Proyecto en desarrollo como trabajo institucional escolar.
</p>

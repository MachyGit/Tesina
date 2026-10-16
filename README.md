# 🎓 Tesina – Campus Virtual PROA Río Tercero

Plataforma web escolar desarrollada como proyecto de tesina de 6.º año de la Escuela Experimental PROA de Río Tercero, Córdoba, Argentina.

![Estado](https://img.shields.io/badge/Estado-En%20desarrollo-yellow)
![Backend](https://img.shields.io/badge/Backend-Node.js%20Express-green)
![Base de datos](https://img.shields.io/badge/Base%20de%20datos-MySQL-orange)
![Proyecto](https://img.shields.io/badge/Tipo-Tesina%20Escolar-blue)

---

# 📖 Descripción del proyecto

El proyecto consiste en el desarrollo de una plataforma web institucional para la Escuela Experimental PROA de Río Tercero.

Su objetivo es centralizar la información escolar y facilitar la comunicación entre estudiantes, docentes, preceptores, secretaría y directivos.

La plataforma integra una página institucional, un sistema de inicio de sesión, un Campus Virtual, gestión de avisos y herramientas de asistencia mediante inteligencia artificial.

También incorpora un bot de Telegram desarrollado en Python.

---

# 🎯 Objetivos

## Objetivo general

Desarrollar una plataforma web escolar que permita mejorar la organización, comunicación y acceso a la información académica dentro de la institución.

## Objetivos específicos

Centralizar la información institucional.
Facilitar la comunicación escolar.
Implementar un sistema de inicio de sesión.
Organizar los usuarios según sus roles.
Permitir la publicación y consulta de avisos.
Gestionar información académica.
Incorporar un asistente virtual.
Integrar un bot de Telegram.
Implementar una base de datos.
Diseñar una interfaz accesible desde computadoras y celulares.

---

# ⚙️ Funcionalidades del sistema

## 1. Página institucional

La página principal permite acceder a información sobre la institución.

Incluye:

Inicio.
Información institucional.
Galería de imágenes.
Contacto.
Acceso al Campus Virtual.
Diseño adaptable a diferentes pantallas.
Modo claro y oscuro.

## 2. Sistema de inicio de sesión

El Campus Virtual contempla un sistema de autenticación que permite identificar a los usuarios y controlar el acceso según su rol.

### Roles del sistema

Director.
Secretaría.
Preceptor.
Profesor.
Alumno.

Cada rol tiene permisos específicos dentro del sistema.

## 3. Gestión de avisos

El sistema contempla las siguientes funcionalidades:

Publicación de novedades.
Consulta de avisos.
Organización de comunicaciones.
Gestión de avisos institucionales.
Avisos específicos por curso.
Restricción de acciones según los permisos del usuario.

## 4. Campus Virtual

El Campus Virtual busca centralizar las herramientas académicas.

### Funcionalidades contempladas

Consulta de novedades.
Información académica.
Avisos por curso.
Consulta de asistencia.
Gestión de usuarios.
Acceso a herramientas según permisos.

Algunas funcionalidades todavía se encuentran en desarrollo.

## 5. Asistente virtual

El proyecto contempla la incorporación de un asistente virtual para responder preguntas relacionadas con la escuela y el Campus Virtual.

Su objetivo es facilitar el acceso a información institucional y ayudar a los usuarios a utilizar la plataforma.

## 6. Bot de Telegram

El sistema incluye un bot desarrollado en Python.

### Funcionalidades del bot

Verificación de usuarios.
Vinculación de cuentas.
Consulta de avisos.
Publicación de novedades según permisos.
Consulta de asistencia.
Respuestas mediante Google Gemini.

La integración completa del bot continúa en desarrollo.

---

# 💻 Tecnologías utilizadas

## Frontend

HTML5.
CSS3.
JavaScript.
React (en componentes específicos).

## Backend

Node.js.
Express.js.
JavaScript.
MySQL.
JWT para autenticación.

## Bot de Telegram

Python.
pyTelegramBotAPI.
Google Gemini API.
Requests.
python-dotenv.

## Herramientas de desarrollo

Visual Studio Code.
Git.
GitHub.
XAMPP.
phpMyAdmin.

---

# 📂 Estructura general del proyecto
text
Tesina/
│
├── backend/
│   ├── config/
│   │   └── db.js
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── server.js
│   ├── package.json
│   └── .env.example
│
├── frontend-web/
│   ├── index.html
│   ├── login.html
│   ├── src/
│   │   ├── context/
│   │   ├── services/
│   │   └── App.jsx
│   └── public/
│
├── telegram-bot/
│   ├── bot.py
│   ├── commands.py
│   ├── requirements.txt
│   └── .env.example
│
├── database/
│   └── schema.sql
│
└── README.md

**Nota:** La estructura debe comprobarse con los archivos reales del repositorio.

---

# 🛠️ Requisitos para ejecutar el proyecto

Para ejecutar el sistema es necesario instalar:

Node.js.
npm.
Python 3.
MySQL.
XAMPP o un servidor MySQL equivalente.
Git.

También se necesita conexión a Internet para utilizar las APIs externas.

---

# 🚀 Instalación y ejecución

## Paso 1. Clonar el repositorio

Abrir una terminal y ejecutar:
bash
git clone https://github.com/MachyGit/Tesina.git

Ingresar a la carpeta:
bash
cd Tesina

## Paso 2. Instalar dependencias del backend
bash
cd backend
npm install

## Paso 3. Configurar variables de entorno

Crear un archivo .env dentro de la carpeta backend, utilizando como referencia .env.example.

### Ejemplo de configuración
env
PORT=5000

DB_HOST=localhost
DB_PORT=3307
DB_USER=tu_usuario
DB_PASSWORD=tu_contraseña
DB_NAME=escuela_db

MAIL_USER=tu_correo
MAIL_PASS=tu_clave_de_aplicacion

Los valores deben adaptarse a la configuración local.

**Importante:** No publicar contraseñas, tokens ni claves reales en GitHub.

## Paso 4. Configurar la base de datos

1. Abrir XAMPP.
2. Iniciar MySQL.
3. Acceder a phpMyAdmin.
4. Crear la base de datos escuela_db.
5. Importar el archivo SQL del proyecto, si está disponible.
6. Verificar las credenciales del archivo .env.

El puerto debe coincidir con el configurado en MySQL.

## Paso 5. Iniciar el backend

Desde la carpeta backend, ejecutar:
bash
npm start

El servidor utiliza de manera predeterminada el puerto 5000.
text
http://localhost:5000

## Paso 6. Ejecutar el frontend

Abrir la carpeta frontend-web en Visual Studio Code.

Para las páginas HTML se puede utilizar Live Server.

Si se utiliza la versión desarrollada con React, deben instalarse las dependencias correspondientes y ejecutar el comando definido en su package.json.

## Paso 7. Configurar el bot de Telegram

Ingresar a la carpeta:
bash
cd telegram-bot

Instalar las dependencias:
bash
pip install -r requirements.txt

Configurar las variables de entorno necesarias para Telegram y Google Gemini.

El archivo de inicio del bot debe comprobarse en la versión actual del proyecto.

---

# 🗄️ Configuración de la base de datos

El sistema utiliza MySQL para almacenar información relacionada con los usuarios y las funcionalidades escolares.

## Nombre de la base de datos
text
escuela_db

## Archivo de conexión
text
backend/config/db.js
La información de conexión se obtiene de las variables de entorno.

No deben publicarse credenciales reales ni datos privados de estudiantes o docentes.

---

# 🔒 Seguridad

Durante el desarrollo se tienen en cuenta las siguientes medidas:

Autenticación de usuarios.
Diferenciación de permisos según roles.
Protección de contraseñas y credenciales.
Uso de variables de entorno.
Restricción de operaciones administrativas.
Validación de datos.
Control de acceso a funcionalidades.

Algunas medidas requieren pruebas adicionales para confirmar su funcionamiento.

---

# 📌 Estado actual del proyecto

**Estado general: En desarrollo.**

## Componentes desarrollados

Página institucional.
Diseño del inicio de sesión.
Estructura del backend.
Configuración inicial de MySQL.
Organización de usuarios y roles.
Estructura del bot de Telegram.
Funciones iniciales relacionadas con avisos.
Diseño adaptable a dispositivos móviles.

## Componentes pendientes de completar o verificar

Funcionamiento completo del inicio de sesión.
Validación de permisos.
Integración completa del frontend y backend.
Pruebas de conexión con MySQL.
Integración del bot de Telegram.
Pruebas de las funcionalidades académicas.
Corrección de errores.
Verificación de la instalación desde una copia del repositorio.

---

# ⚠️ Limitaciones conocidas

## 1. Conexión con MySQL

Se presentaron errores de autenticación relacionados con las credenciales de acceso a la base de datos.

## 2. Configuración del correo electrónico

El formulario de contacto requiere configurar correctamente las credenciales del servicio de correo.

## 3. Integración de componentes

Algunas funcionalidades todavía necesitan pruebas para verificar la comunicación entre el frontend, backend y base de datos.

## 4. Configuración local

El proyecto requiere variables de entorno y una base de datos preparada para funcionar correctamente.

---

# 🔮 Futuras mejoras

Sistema de notificaciones.
Aplicación móvil.
Entrega de trabajos prácticos.
Mejoras en el panel de administración.
Chat entre alumnos y docentes.
Mejoras en el asistente virtual.
Optimización de rendimiento.
Mayor integración con Telegram.

---

# 👥 Integrantes del equipo

Leandro Nuñez.
Santiago Vigna.
Santiago Machado.

---

# 🏫 Institución

**Escuela Experimental PROA – Río Tercero**

**Orientación:** Desarrollo de Software.

**Ubicación:** Río Tercero, Córdoba, Argentina.

**Proyecto:** Tesina de 6.º año – 2026.

---

# 📄 Conclusión

El Campus Virtual PROA busca mejorar la comunicación y organización de la información escolar mediante una plataforma digital centralizada.

El proyecto permite aplicar conocimientos de desarrollo web, programación, bases de datos, autenticación de usuarios e integración con servicios externos.

Actualmente continúa en desarrollo, con el objetivo de lograr un sistema funcional, seguro y accesible para la comunidad educativa.

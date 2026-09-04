# telegram-bot/commands.py
import os
import google.generativeai as genai
from api import (
    verificar_usuario, vincular_cuenta,
    publicar_aviso, obtener_avisos, obtener_asistencia_alumno
)

# ── Configurar Gemini ──────────────────────────────────────────────────────────
genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
modelo_ia = genai.GenerativeModel("gemini-2.0-flash")

CONTEXTO_IA = """
Sos el asistente virtual del Campus Escolar PROA de Río Tercero, Córdoba, Argentina.
Solo respondés preguntas relacionadas con la escuela y el campus virtual.
Si te preguntan algo ajeno a la escuela, deciles amablemente que solo podés ayudar con temas escolares.
Respondé siempre en español argentino, de forma clara y amigable.

Lo que sabés:
- La escuela se llama PROA Sede Río Tercero. Email: lenunez@escuelasproa.edu.ar
- Orientación: Bachiller en Desarrollo de Software
- Los roles son: director, secretaria, preceptor, profesor, alumno
- Los alumnos pueden ver avisos y su asistencia
- Los profesores publican tareas y avisos de sus materias
- Los preceptores registran la asistencia diaria
- El director y la secretaria gestionan cuentas y comunicados
- Para dudas técnicas del campus, sugerí contactar a la secretaría
"""

# Roles que pueden usar comandos de publicación/consulta avanzada
ROLES_STAFF = {'director', 'secretaria', 'preceptor', 'profesor'}

# ── Helper: verificar y obtener usuario ───────────────────────────────────────
def _get_usuario(bot, message) -> dict | None:
    """Verifica si el telegram_id está vinculado. Devuelve el usuario o None."""
    tid = str(message.from_user.id)
    data = verificar_usuario(tid)

    if data is None:
        bot.reply_to(message, "❌ Error al conectar con el servidor.")
        return None

    if data.get("error") == "sin_conexion":
        bot.reply_to(message, "⚠️ No se pudo conectar al servidor. ¿Está corriendo el backend?")
        return None

    if not data.get("vinculado"):
        bot.reply_to(message,
            "❌ Tu cuenta de Telegram no está vinculada al campus.\n\n"
            "Para vincularla:\n"
            "1️⃣ Ingresá al campus en tu navegador\n"
            "2️⃣ Andá a tu perfil → *Vincular Telegram*\n"
            "3️⃣ Copiá el código que aparece\n"
            "4️⃣ Mandá acá: /vincular <código>",
            parse_mode="Markdown"
        )
        return None

    return data  # { vinculado: true, nombre, rol }


def _solo_staff(bot, message, usuario: dict) -> bool:
    """Devuelve True si el usuario tiene rol de staff. Si no, avisa y retorna False."""
    if usuario.get("rol") not in ROLES_STAFF:
        bot.reply_to(message, "❌ Esta acción solo está disponible para personal de la escuela.")
        return False
    return True


# ── Registrar todos los handlers ──────────────────────────────────────────────
def registrar_comandos(bot):

    # ── /start ────────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["start"])
    def cmd_start(message):
        tid = str(message.from_user.id)
        data = verificar_usuario(tid)

        if data and data.get("vinculado"):
            nombre = data.get("nombre", "")
            rol    = data.get("rol", "")
            bot.reply_to(message,
                f"👋 ¡Bienvenido de nuevo, *{nombre}*!\n"
                f"Rol: *{rol.upper()}*\n\n"
                + _menu_segun_rol(rol),
                parse_mode="Markdown"
            )
        else:
            bot.reply_to(message,
                "👋 ¡Hola! Soy el bot del *Campus PROA Río Tercero*.\n\n"
                "Para usar el bot tenés que vincular tu cuenta:\n"
                "1️⃣ Ingresá al campus en tu navegador\n"
                "2️⃣ Andá a tu perfil → *Vincular Telegram*\n"
                "3️⃣ Copiá el código que aparece\n"
                "4️⃣ Mandá acá: /vincular <código>\n\n"
                "💬 También podés hacerme preguntas sobre la escuela.",
                parse_mode="Markdown"
            )

    # ── /vincular <código> ────────────────────────────────────────────────────
    @bot.message_handler(commands=["vincular"])
    def cmd_vincular(message):
        partes = message.text.strip().split()
        if len(partes) < 2:
            bot.reply_to(message,
                "⚠️ Usá el formato correcto:\n`/vincular 123456`",
                parse_mode="Markdown"
            )
            return

        token = partes[1].strip()
        tid   = str(message.from_user.id)
        resp  = vincular_cuenta(token, tid)

        if "error" in resp:
            bot.reply_to(message, f"❌ {resp['error']}")
        else:
            nombre = resp.get("nombre", "")
            rol    = resp.get("rol", "")
            bot.reply_to(message,
                f"✅ *¡Cuenta vinculada!*\n"
                f"Nombre: {nombre}\n"
                f"Rol: {rol.upper()}\n\n"
                + _menu_segun_rol(rol),
                parse_mode="Markdown"
            )

    # ── /aviso /tarea /horario /urgente <texto> ───────────────────────────────
    @bot.message_handler(commands=["aviso", "tarea", "horario", "urgente"])
    def cmd_publicar(message):
        usuario = _get_usuario(bot, message)
        if not usuario or not _solo_staff(bot, message, usuario):
            return

        tipo_map = {
            "aviso":   "general",
            "tarea":   "tarea",
            "horario": "horario",
            "urgente": "urgente",
        }
        comando = message.text.split()[0].lstrip("/").lower()
        tipo    = tipo_map.get(comando, "general")
        texto   = message.text[len(comando) + 2:].strip()

        if not texto:
            bot.reply_to(message,
                f"⚠️ Escribí el contenido después del comando.\n"
                f"Ejemplo: `/{comando} Mañana no hay clases`",
                parse_mode="Markdown"
            )
            return

        titulo = f"[{tipo.upper()}] {texto[:60]}"
        resp   = publicar_aviso(str(message.from_user.id), titulo, texto, tipo)

        if "error" in resp:
            bot.reply_to(message, f"❌ {resp['error']}")
        else:
            emoji = {"general": "📣", "tarea": "📚", "horario": "🕐", "urgente": "🚨"}
            bot.reply_to(message,
                f"{emoji[tipo]} *Aviso publicado*\n"
                f"Tipo: {tipo.upper()}\n"
                f"Contenido: {texto}",
                parse_mode="Markdown"
            )

    # ── /ver ──────────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["ver"])
    def cmd_ver_avisos(message):
        usuario = _get_usuario(bot, message)
        if not usuario:
            return

        avisos = obtener_avisos(5)
        if not avisos:
            bot.reply_to(message, "📭 No hay avisos recientes o no se pudo conectar al servidor.")
            return

        texto = "📋 *Últimos avisos:*\n\n"
        for a in avisos:
            fecha = a.get("fecha", "")[:10]
            texto += f"• *[{a.get('tipo','').upper()}]* {a.get('titulo','')}\n"
            texto += f"  👤 {a.get('autor','')}  📅 {fecha}\n\n"

        bot.reply_to(message, texto, parse_mode="Markdown")

    # ── /asistencia <nombre alumno> ───────────────────────────────────────────
    @bot.message_handler(commands=["asistencia"])
    def cmd_asistencia(message):
        usuario = _get_usuario(bot, message)
        if not usuario or not _solo_staff(bot, message, usuario):
            return

        partes = message.text.strip().split(maxsplit=1)
        if len(partes) < 2:
            bot.reply_to(message,
                "⚠️ Usá el formato:\n`/asistencia Nombre del alumno`",
                parse_mode="Markdown"
            )
            return

        nombre_alumno = partes[1].strip()
        tid  = str(message.from_user.id)
        resp = obtener_asistencia_alumno(tid, nombre_alumno)

        if "error" in resp:
            bot.reply_to(message, f"❌ {resp['error']}")
            return

        if "message" in resp:
            bot.reply_to(message, f"🔍 {resp['message']}")
            return

        alumno    = resp.get("alumno", nombre_alumno)
        stats     = resp.get("stats", {})
        registros = resp.get("registros", [])

        texto  = f"📊 *Asistencia de {alumno}*\n\n"
        texto += f"✅ Presente: {stats.get('presente',0)}\n"
        texto += f"❌ Ausente: {stats.get('ausente',0)}\n"
        texto += f"🕐 Tarde: {stats.get('tarde',0)}\n\n"
        texto += "*Últimos registros:*\n"

        for r in registros[:7]:
            estado_emoji = {"presente": "✅", "ausente": "❌", "tarde": "🕐"}.get(r["estado"], "❓")
            texto += f"  {estado_emoji} {r['fecha']}"
            if r.get("observacion"):
                texto += f" — {r['observacion']}"
            texto += "\n"

        bot.reply_to(message, texto, parse_mode="Markdown")

    # ── /ayuda ────────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["ayuda", "help"])
    def cmd_ayuda(message):
        usuario = _get_usuario(bot, message)
        if not usuario:
            return
        bot.reply_to(message, _menu_segun_rol(usuario.get("rol", "")), parse_mode="Markdown")

    # ── Mensajes de texto libre → Gemini ──────────────────────────────────────
    @bot.message_handler(func=lambda m: m.text and not m.text.startswith("/"))
    def handle_texto_libre(message):
        usuario = _get_usuario(bot, message)
        if not usuario:
            return

        try:
            bot.send_chat_action(message.chat.id, "typing")
            prompt   = f"{CONTEXTO_IA}\n\nUsuario: {message.text}"
            respuesta = modelo_ia.generate_content(prompt)
            bot.reply_to(message, respuesta.text)
        except Exception as e:
            print(f"[Gemini] Error: {e}")
            bot.reply_to(message, "❌ No pude procesar tu consulta. Intentá de nuevo.")


# ── Menú según rol ─────────────────────────────────────────────────────────────
def _menu_segun_rol(rol: str) -> str:
    base = (
        "📋 *Comandos disponibles:*\n"
        "/ver — Ver últimos avisos\n"
        "/ayuda — Ver este menú\n"
        "💬 O escribime cualquier pregunta sobre la escuela\n"
    )
    if rol in ROLES_STAFF:
        base += (
            "\n*Solo para personal:*\n"
            "/aviso [texto] — Publicar aviso general 📣\n"
            "/tarea [texto] — Publicar tarea 📚\n"
            "/horario [texto] — Cambio de horario 🕐\n"
            "/urgente [texto] — Aviso urgente 🚨\n"
            "/asistencia [nombre] — Ver asistencia de un alumno 📊\n"
        )
    return base

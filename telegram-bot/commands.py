import requests
import os
from google import genai

# =============================================
# 🔐 CONFIG GEMINI (NUEVA LIBRERÍA)
# =============================================
client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))

# =============================================
# 🔐 IDs DE TELEGRAM AUTORIZADOS
# =============================================
IDS_AUTORIZADOS = {
    '8467741760': 'director',
    '7859819402': 'secretaria',
}

# =============================================
# 🧠 CONTEXTO IA
# =============================================
CONTEXTO_ESCUELA = """
Sos el asistente virtual del Campus Escolar de Río Tercero, Córdoba, Argentina.
Solo podés responder preguntas relacionadas con la escuela y el campus virtual.
Si te preguntan algo que no tiene que ver con la escuela, respondé amablemente
que solo podés ayudar con temas escolares.
Respondé siempre en español, de forma clara y amigable.

Información que conocés sobre la escuela:
- La escuela tiene un campus virtual con roles: director, secretaria, preceptor, profesor y alumno
- Los alumnos pueden ver avisos, tareas y su asistencia desde el campus
- Los profesores pueden publicar tareas y avisos de sus materias
- Los preceptores registran la asistencia diaria de los alumnos
- El director y la secretaria gestionan cuentas de usuarios y publican comunicados
- Para dudas técnicas del campus, sugerí contactar a la secretaría

- Nombre: Proa Sede Rio Tercero
- Dirección: Río Tercero, Córdoba
- Email: lenunez@escuelasproa.edu.ar
- Horarios: 01:00 a 19:00
- Orientaciones: Bachiller en desarrollo de software
"""

API_URL = os.getenv("API_URL", "http://localhost:5000/api")

# =============================================
# 🔒 VERIFICAR USUARIO
# =============================================
def verificar_usuario(telegram_id):
    telegram_id = str(telegram_id)
    if telegram_id not in IDS_AUTORIZADOS:
        return None
    return {
        "telegram_id": telegram_id,
        "rol": IDS_AUTORIZADOS[telegram_id]
    }

# =============================================
# 🤖 IA GEMINI
# =============================================
def responder_mensaje_libre(bot, message):
    telegram_id = str(message.from_user.id)
    usuario = verificar_usuario(telegram_id)

    if not usuario:
        bot.reply_to(message, "❌ No tenés permiso para usar este bot.")
        return

    try:
        bot.send_chat_action(message.chat.id, 'typing')

        prompt = f"{CONTEXTO_ESCUELA}\n\nUsuario: {message.text}"

        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt
        )

        bot.reply_to(message, response.text)

    except Exception as e:
        print("ERROR GEMINI:", e)
        bot.reply_to(message, "❌ No pude procesar tu consulta. Intentá de nuevo.")

# =============================================
# 📋 COMANDOS
# =============================================
def registrar_comandos(bot):

    # ── /start ──
    @bot.message_handler(commands=['start'])
    def start(message):
        telegram_id = str(message.from_user.id)
        usuario = verificar_usuario(telegram_id)

        if not usuario:
            bot.reply_to(message, "❌ No tenés permiso para usar este bot.")
            return

        bot.reply_to(message,
            f"👋 Bienvenido al bot del Campus Escolar!\n"
            f"Tu rol: *{usuario['rol'].upper()}*\n\n"
            f"📋 *Comandos disponibles:*\n"
            f"/aviso [texto] — Publicar aviso general\n"
            f"/tarea [texto] — Publicar tarea\n"
            f"/horario [texto] — Cambio de horario\n"
            f"/urgente [texto] — Aviso urgente 🚨\n"
            f"/ver — Ver últimos avisos\n\n"
            f"💬 También podés escribirme cualquier pregunta sobre la escuela.",
            parse_mode='Markdown'
        )

    # ── /aviso /tarea /horario /urgente ──
    @bot.message_handler(commands=['aviso', 'tarea', 'horario', 'urgente'])
    def publicar_aviso(message):
        telegram_id = str(message.from_user.id)
        usuario = verificar_usuario(telegram_id)

        if not usuario:
            bot.reply_to(message, "❌ No tenés permiso para usar este bot.")
            return

        if usuario['rol'] not in ['director', 'secretaria']:
            bot.reply_to(message, "❌ Solo directores y secretarias pueden publicar avisos.")
            return

        comando = message.text.split()[0].replace('/', '')
        texto = message.text[len(comando) + 2:].strip()

        if not texto:
            bot.reply_to(message,
                f"⚠️ Escribí el contenido después del comando.\n"
                f"Ejemplo: /{comando} Mañana no hay clases"
            )
            return

        tipo_map = {
            'aviso':   'general',
            'tarea':   'tarea',
            'horario': 'horario',
            'urgente': 'urgente'
        }
        tipo = tipo_map.get(comando, 'general')

        try:
            res = requests.post(f"{API_URL}/avisos/telegram", json={
                'titulo':      f"[{tipo.upper()}] {texto[:50]}",
                'contenido':   texto,
                'tipo':        tipo,
                'telegram_id': telegram_id
            })

            if res.status_code == 200:
                emoji = {'general':'📣', 'tarea':'📚', 'horario':'🕐', 'urgente':'🚨'}
                bot.reply_to(message,
                    f"{emoji[tipo]} *Aviso publicado correctamente*\n"
                    f"Tipo: {tipo.upper()}\n"
                    f"Contenido: {texto}",
                    parse_mode='Markdown'
                )
            else:
                bot.reply_to(message, "❌ Error al publicar el aviso en la plataforma.")

        except requests.exceptions.ConnectionError:
            bot.reply_to(message, "⚠️ No se pudo conectar al servidor. ¿Está corriendo el backend?")
        except Exception as e:
            bot.reply_to(message, f"❌ Error inesperado: {str(e)}")

    # ── /ver ──
    @bot.message_handler(commands=['ver'])
    def ver_avisos(message):
        telegram_id = str(message.from_user.id)
        usuario = verificar_usuario(telegram_id)

        if not usuario:
            bot.reply_to(message, "❌ No tenés permiso para usar este bot.")
            return

        try:
            res = requests.get(f"{API_URL}/avisos?limit=5")
            avisos = res.json()

            if not avisos:
                bot.reply_to(message, "📭 No hay avisos recientes.")
                return

            texto = "📋 *Últimos avisos:*\n\n"
            for a in avisos:
                texto += f"• *[{a['tipo'].upper()}]* {a['titulo']}\n"
                texto += f"  📅 {a['fecha']}\n\n"

            bot.reply_to(message, texto, parse_mode='Markdown')

        except requests.exceptions.ConnectionError:
            bot.reply_to(message, "⚠️ No se pudo conectar al servidor.")
        except Exception as e:
            bot.reply_to(message, f"❌ Error: {str(e)}")

    # ── Mensajes de texto libre ──
    @bot.message_handler(func=lambda message: message.text and not message.text.startswith('/'))
    def handle_texto(message):
        responder_mensaje_libre(bot, message)
import requests
import os
from auth import verificar_usuario

API_URL = os.getenv("API_URL", "http://localhost:5000/api")

def registrar_comandos(bot):

    @bot.message_handler(commands=['start'])
    def start(message):
        bot.reply_to(message, 
            "👋 Bienvenido al bot de la escuela.\n\n"
            "Comandos disponibles:\n"
            "/aviso [texto] - Publicar aviso general\n"
            "/tarea [texto] - Publicar tarea\n"
            "/horario [texto] - Cambio de horario\n"
            "/urgente [texto] - Aviso urgente\n"
            "/ver - Ver últimos avisos"
        )

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
        texto = message.text[len(comando)+2:].strip()

        if not texto:
            bot.reply_to(message, "⚠️ Escribí el contenido del aviso después del comando.")
            return

        tipo_map = {'aviso': 'general', 'tarea': 'tarea', 'horario': 'horario', 'urgente': 'urgente'}
        tipo = tipo_map.get(comando, 'general')

        try:
            res = requests.post(f"{API_URL}/avisos/telegram", json={
                'titulo': f"[{tipo.upper()}] {texto[:50]}",
                'contenido': texto,
                'tipo': tipo,
                'telegram_id': telegram_id
            })
            if res.status_code == 200:
                bot.reply_to(message, f"✅ Aviso publicado correctamente como: {tipo.upper()}")
            else:
                bot.reply_to(message, "❌ Error al publicar el aviso.")
        except Exception as e:
            bot.reply_to(message, f"❌ Error de conexión: {str(e)}")

    @bot.message_handler(commands=['ver'])
    def ver_avisos(message):
        telegram_id = str(message.from_user.id)
        usuario = verificar_usuario(telegram_id)
        if not usuario:
            bot.reply_to(message, "❌ Sin permiso.")
            return
        try:
            res = requests.get(f"{API_URL}/avisos?limit=5")
            avisos = res.json()
            if not avisos:
                bot.reply_to(message, "No hay avisos recientes.")
                return
            texto = "📋 Últimos avisos:\n\n"
            for a in avisos:
                texto += f"• [{a['tipo'].upper()}] {a['titulo']}\n  {a['fecha']}\n\n"
            bot.reply_to(message, texto)
        except Exception as e:
            bot.reply_to(message, f"❌ Error: {str(e)}")

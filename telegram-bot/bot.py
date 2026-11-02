# © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
# telegram-bot/bot.py
# Arranque del bot del Campus PROA.   Uso:  python bot.py
import sys

import requests

import config

problemas = config.validar()
if problemas:
    print("❌ Configuración incompleta (copiá .env.example a .env y completalo):")
    for p in problemas:
        print("   -", p)
    sys.exit(1)

import telebot  # noqa: E402  (se importa después de validar para dar un error claro)
from telebot import types  # noqa: E402

from commands import registrar_comandos  # noqa: E402

bot = telebot.TeleBot(config.TELEGRAM_TOKEN, parse_mode=None, threaded=True)
registrar_comandos(bot)


def _chequeos():
    # ¿Responde el backend y es correcto el BOT_SECRET?
    try:
        r = requests.get(f"{config.API_URL}/telegram/verificar", params={"telegram_id": "0"},
                         headers={"X-Bot-Secret": config.BOT_SECRET}, timeout=6)
        if r.status_code == 403:
            print("⚠️  El backend rechazó el BOT_SECRET: tiene que ser IGUAL en el .env del backend y en el del bot.")
        elif r.ok:
            print("✅ Backend del campus: conectado")
        else:
            print(f"⚠️  El backend respondió HTTP {r.status_code}")
    except requests.RequestException:
        print(f"⚠️  No se pudo conectar al backend en {config.API_URL} (¿está corriendo?). El bot arranca igual y reintenta.")
    proveedores = [n for n, k in (("Groq", config.GROQ_API_KEY), ("Gemini", config.GEMINI_API_KEY)) if k]
    if proveedores:
        print("✅ IA: " + " + ".join(proveedores) + (" (respaldo)" if len(proveedores) > 1 else ""))
    else:
        print("ℹ️  IA sin configurar (falta GROQ_API_KEY o GEMINI_API_KEY): el bot funciona, pero sin preguntas libres.")


try:
    me = bot.get_me()
    print(f"🤖 Bot del Campus PROA iniciado como @{me.username}")
except Exception as e:  # noqa: BLE001
    print(f"❌ No se pudo conectar con Telegram: {e}\n   Revisá TELEGRAM_TOKEN y tu conexión a internet.")
    sys.exit(1)

_chequeos()

try:
    bot.set_my_commands([
        types.BotCommand("start", "Empezar"),
        types.BotCommand("avisos", "Ver los últimos avisos"),
        types.BotCommand("asistencia", "Asistencia"),
        types.BotCommand("materias", "Mis materias"),
        types.BotCommand("aviso", "Publicar un aviso (personal)"),
        types.BotCommand("vincular", "Vincular mi cuenta del campus"),
        types.BotCommand("ayuda", "Qué puedo hacer"),
        types.BotCommand("cancelar", "Cancelar lo que estoy haciendo"),
    ])
except Exception as e:  # noqa: BLE001
    print(f"ℹ️  No se pudo registrar el menú de comandos: {e}")

bot.infinity_polling(timeout=30, long_polling_timeout=30, skip_pending=True)

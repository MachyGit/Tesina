# telegram-bot/bot.py
import os
import sys
from pathlib import Path

# Cargar .env desde la carpeta del bot
env_path = Path(__file__).parent / ".env"
if env_path.exists():
    from dotenv import load_dotenv
    load_dotenv(env_path)
else:
    print("⚠️  No se encontró .env — copiá .env.example a .env y completá los valores")
    sys.exit(1)

import telebot
from commands import registrar_comandos

TOKEN = os.getenv("TELEGRAM_TOKEN", "")
if not TOKEN:
    print("❌ TELEGRAM_TOKEN no está definido en el .env")
    sys.exit(1)

bot = telebot.TeleBot(TOKEN, parse_mode=None)
registrar_comandos(bot)

print("🤖 Bot del Campus PROA iniciado...")
print(f"   Backend: {os.getenv('API_URL', 'http://localhost:5000/api')}")

bot.infinity_polling(timeout=30, long_polling_timeout=30)

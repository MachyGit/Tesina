from dotenv import load_dotenv
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

import telebot
from auth import verificar_usuario
from commands import registrar_comandos

bot = telebot.TeleBot(os.getenv("TELEGRAM_TOKEN"))

registrar_comandos(bot)

print("🤖 Bot de la escuela iniciado...")
bot.polling(none_stop=True)
import telebot
import os
from dotenv import load_dotenv
from auth import verificar_usuario
from commands import registrar_comandos

load_dotenv()
bot = telebot.TeleBot(os.getenv("TELEGRAM_TOKEN"))

registrar_comandos(bot)

print("🤖 Bot de la escuela iniciado...")
bot.polling(none_stop=True)

import requests
import os

API_URL = os.getenv("API_URL", "http://localhost:5000/api")

def verificar_usuario(telegram_id):
    """Verifica si el telegram_id está autorizado en el sistema"""
    try:
        res = requests.get(f"{API_URL}/users/telegram/{telegram_id}")
        if res.status_code == 200:
            return res.json()
        return None
    except:
        return None

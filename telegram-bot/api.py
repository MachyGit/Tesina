# telegram-bot/api.py
# Todas las llamadas al backend pasan por acá
import os
import requests

API_URL    = os.getenv("API_URL", "http://localhost:5000/api")
BOT_SECRET = os.getenv("BOT_SECRET", "")

HEADERS = {
    "Content-Type":  "application/json",
    "X-Bot-Secret":  BOT_SECRET,
}

TIMEOUT = 8  # segundos


def verificar_usuario(telegram_id: str) -> dict | None:
    """Devuelve { vinculado, nombre, rol } o None si hay error."""
    try:
        r = requests.get(
            f"{API_URL}/telegram/verificar",
            params={"telegram_id": telegram_id},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        if r.status_code == 200:
            return r.json()
    except requests.exceptions.ConnectionError:
        return {"error": "sin_conexion"}
    except Exception as e:
        print(f"[API] Error verificar_usuario: {e}")
    return None


def vincular_cuenta(token: str, telegram_id: str) -> dict:
    """Vincula un código generado en la web con este telegram_id."""
    try:
        r = requests.post(
            f"{API_URL}/telegram/vincular",
            json={"token": token, "telegram_id": telegram_id},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        return r.json()
    except requests.exceptions.ConnectionError:
        return {"error": "No se pudo conectar al servidor."}
    except Exception as e:
        return {"error": str(e)}


def publicar_aviso(telegram_id: str, titulo: str, contenido: str, tipo: str) -> dict:
    try:
        r = requests.post(
            f"{API_URL}/avisos/bot",
            json={
                "titulo":      titulo,
                "contenido":   contenido,
                "tipo":        tipo,
                "telegram_id": telegram_id,
            },
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        return r.json()
    except requests.exceptions.ConnectionError:
        return {"error": "No se pudo conectar al servidor."}
    except Exception as e:
        return {"error": str(e)}


def obtener_avisos(limite: int = 5) -> list:
    try:
        r = requests.get(
            f"{API_URL}/avisos",
            params={"limit": limite},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        if r.status_code == 200:
            return r.json()
    except requests.exceptions.ConnectionError:
        return []
    except Exception as e:
        print(f"[API] Error obtener_avisos: {e}")
    return []


def obtener_asistencia_alumno(telegram_id: str, alumno_nombre: str) -> dict:
    try:
        r = requests.get(
            f"{API_URL}/asistencia/bot",
            params={"telegram_id": telegram_id, "alumno_nombre": alumno_nombre},
            headers=HEADERS,
            timeout=TIMEOUT,
        )
        return r.json()
    except requests.exceptions.ConnectionError:
        return {"error": "No se pudo conectar al servidor."}
    except Exception as e:
        return {"error": str(e)}

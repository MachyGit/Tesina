# © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
# telegram-bot/api.py
# Todas las llamadas al backend del campus pasan por acá.
# Cada función devuelve un dict; si algo falla devuelve {"error": "mensaje legible"}.
import requests

import config

_HEADERS = {"Content-Type": "application/json", "X-Bot-Secret": config.BOT_SECRET}
_TIMEOUT = 10
_sesion = requests.Session()


def _pedir(metodo: str, ruta: str, **kwargs) -> dict:
    try:
        r = _sesion.request(metodo, f"{config.API_URL}{ruta}", headers=_HEADERS, timeout=_TIMEOUT, **kwargs)
    except requests.exceptions.ConnectionError:
        return {"error": "No se pudo conectar con el campus. Probá de nuevo en un rato."}
    except requests.exceptions.Timeout:
        return {"error": "El campus tardó demasiado en responder."}
    except Exception as e:  # noqa: BLE001
        print(f"[API] {metodo} {ruta}: {e}")
        return {"error": "Error inesperado al hablar con el campus."}

    try:
        datos = r.json()
    except ValueError:
        return {"error": f"Respuesta inválida del campus (HTTP {r.status_code})."}

    if r.status_code == 403 and isinstance(datos, dict) and "Acceso de bot" in str(datos.get("error", "")):
        # El BOT_SECRET del bot no coincide con el del backend: es un problema de configuración.
        print("[API] ⚠️ El backend rechazó el BOT_SECRET: revisá que sea igual en ambos .env")
        return {"error": "El bot no está autorizado en el campus (revisar configuración)."}
    if isinstance(datos, list):
        return {"items": datos} if r.ok else {"error": "No se pudo obtener la información."}
    if not r.ok and "error" not in datos:
        datos["error"] = f"Error {r.status_code} del campus."
    return datos


def contexto(telegram_id: str) -> dict:
    """Quién es esta persona + su año, materias, avisos y asistencia. {vinculado: False} si no está vinculada."""
    return _pedir("GET", "/telegram/contexto", params={"telegram_id": telegram_id})


def vincular_cuenta(token: str, telegram_id: str) -> dict:
    return _pedir("POST", "/telegram/vincular", json={"token": token, "telegram_id": telegram_id})


def anios_para_publicar(telegram_id: str) -> dict:
    """{todos: bool, anios: [{id, etiqueta}]} — dónde puede publicar esta persona."""
    return _pedir("GET", "/telegram/anios", params={"telegram_id": telegram_id})


def publicar_aviso(telegram_id: str, titulo: str, contenido: str, tipo: str,
                   anio_id=None, fecha_evento=None, todo_el_dia=False, enviar_calendario=False) -> dict:
    cuerpo = {"telegram_id": telegram_id, "titulo": titulo, "contenido": contenido, "tipo": tipo,
              "anio_id": anio_id}
    if fecha_evento:
        cuerpo["fecha_evento"] = fecha_evento
        cuerpo["todo_el_dia"] = bool(todo_el_dia)
        cuerpo["enviar_calendario"] = bool(enviar_calendario)
    return _pedir("POST", "/avisos/bot", json=cuerpo)


def asistencia_de_alumno(telegram_id: str, nombre: str) -> dict:
    """Solo personal. Puede devolver {coincidencias: [...]} si el nombre es ambiguo."""
    return _pedir("GET", "/asistencia/bot", params={"telegram_id": telegram_id, "alumno_nombre": nombre})

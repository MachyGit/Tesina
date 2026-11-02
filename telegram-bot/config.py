# © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
# telegram-bot/config.py
# Toda la configuración del bot sale del .env (nunca se escriben claves en el código).
import os
from pathlib import Path

AQUI = Path(__file__).parent

try:
    from dotenv import load_dotenv
    load_dotenv(AQUI / ".env")
except ImportError:  # sin python-dotenv se usan las variables del sistema
    pass


def _int(nombre: str, defecto: int) -> int:
    try:
        return int(os.getenv(nombre, defecto))
    except ValueError:
        return defecto


TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN", "")
API_URL        = os.getenv("API_URL", "http://localhost:5000/api").rstrip("/")
BOT_SECRET     = os.getenv("BOT_SECRET", "")

# ── IA (gratuita) ─────────────────────────────────────────────────────────────
# Principal: Groq. Respaldo opcional: Gemini. Alcanza con cargar UNA de las dos claves.
GROQ_API_KEY    = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL      = os.getenv("GROQ_MODEL", "")           # vacío = elige solo el mejor disponible
GROQ_BASE_URL   = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
GEMINI_API_KEY  = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL    = os.getenv("GEMINI_MODEL", "")         # vacío = elige solo un modelo "flash-lite"
GEMINI_BASE_URL = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta").rstrip("/")

# ── Límites (cuidan la cuota gratuita y evitan abusos) ────────────────────────
IA_COOLDOWN_SEG      = _int("IA_COOLDOWN_SEG", 3)         # espera mínima entre preguntas de una persona
IA_MAX_POR_HORA      = _int("IA_MAX_POR_HORA", 20)        # preguntas a la IA por persona por hora
IA_MAX_POR_DIA_TOTAL = _int("IA_MAX_POR_DIA_TOTAL", 600)  # tope diario de todo el bot
MAX_CARACTERES       = _int("MAX_CARACTERES", 500)        # largo máximo de una pregunta
IA_TIMEOUT_SEG       = _int("IA_TIMEOUT_SEG", 25)

# Archivo (editable) con los datos de la escuela que la IA puede usar
CONOCIMIENTO_PATH = AQUI / "institucion.txt"


def validar() -> list:
    """Devuelve la lista de problemas de configuración (vacía = todo bien)."""
    problemas = []
    if not TELEGRAM_TOKEN:
        problemas.append("Falta TELEGRAM_TOKEN (el token que te da @BotFather).")
    if not BOT_SECRET:
        problemas.append("Falta BOT_SECRET (tiene que ser igual al del .env del backend).")
    return problemas


def hay_ia() -> bool:
    return bool(GROQ_API_KEY or GEMINI_API_KEY)

# © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
# telegram-bot/limites.py
# Límites de uso de la IA: cuidan la cuota gratuita y evitan que alguien la agote o abuse.
# Todo en memoria (se reinicia si se reinicia el bot, lo cual está bien para este uso).
import threading
import time
from collections import defaultdict, deque
from datetime import date

import config


class Limitador:
    def __init__(self):
        self._lock = threading.Lock()
        self._ultimo = {}                       # uid -> timestamp de la última pregunta
        self._horas = defaultdict(deque)        # uid -> timestamps de la última hora
        self._dia = date.today()
        self._total_dia = 0

    def _rotar_dia(self):
        hoy = date.today()
        if hoy != self._dia:
            self._dia, self._total_dia = hoy, 0

    def permitir(self, uid) -> tuple:
        """Devuelve (permitido, motivo, segundos_de_espera). Motivo: 'cooldown' | 'hora' | 'dia' | ''."""
        ahora = time.time()
        with self._lock:
            self._rotar_dia()
            if self._total_dia >= config.IA_MAX_POR_DIA_TOTAL:
                return False, "dia", 0
            espera = config.IA_COOLDOWN_SEG - (ahora - self._ultimo.get(uid, 0))
            if espera > 0:
                return False, "cooldown", int(espera) + 1
            ventana = self._horas[uid]
            while ventana and ahora - ventana[0] > 3600:
                ventana.popleft()
            if len(ventana) >= config.IA_MAX_POR_HORA:
                return False, "hora", int(3600 - (ahora - ventana[0])) // 60 + 1
        return True, "", 0

    def registrar(self, uid):
        """Anota que se hizo una consulta a la IA (llamar solo si realmente se gastó una)."""
        ahora = time.time()
        with self._lock:
            self._rotar_dia()
            self._ultimo[uid] = ahora
            self._horas[uid].append(ahora)
            self._total_dia += 1

    def tocar(self, uid):
        """Marca actividad sin gastar cuota (para el cooldown de mensajes que no llegan a la IA)."""
        with self._lock:
            self._ultimo[uid] = time.time()

    @property
    def usadas_hoy(self) -> int:
        with self._lock:
            self._rotar_dia()
            return self._total_dia


limitador = Limitador()

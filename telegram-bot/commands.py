# © 2026 Pito, Santiago Vigna y Santiago Machado — Campus Virtual PROA. Todos los derechos reservados (ver LICENSE).
# telegram-bot/commands.py
# Comandos, botones y flujos del bot. La IA vive en ia.py; los datos, en el backend (api.py).
import functools
import html
import re
import threading
import time
from collections import defaultdict, deque
from datetime import datetime

from telebot import types

import api
import config
import ia
from limites import limitador

ROLES_STAFF = {"director", "secretaria", "preceptor", "profesor"}
NOMBRE_ROL = {"director": "Director/a", "secretaria": "Secretaría", "preceptor": "Preceptor/a",
              "profesor": "Profesor/a", "alumno": "Alumno/a"}
TIPOS = {"general": ("📣", "General"), "tarea": ("📚", "Actividad / tarea"),
         "horario": ("🕐", "Horario"), "urgente": ("🚨", "Urgente")}
COMANDO_TIPO = {"aviso": "general", "tarea": "tarea", "horario": "horario", "urgente": "urgente"}

B_AVISOS, B_ASIST, B_MATERIAS, B_AYUDA = "📋 Avisos", "📊 Mi asistencia", "📚 Mis materias", "❓ Ayuda"
B_PUBLICAR, B_ASIST_ALUMNO = "📣 Publicar aviso", "🔎 Asistencia de un alumno"
BOTONES = {B_AVISOS, B_ASIST, B_MATERIAS, B_AYUDA, B_PUBLICAR, B_ASIST_ALUMNO}

MIN_VINCULAR = (5, 600)  # 5 intentos cada 10 minutos por persona (el código tiene 6 dígitos)
TTL_FLUJO = 600          # un flujo a medias (publicar, buscar alumno) se descarta a los 10 minutos


def h(texto) -> str:
    """Escapa texto de terceros para mandarlo con parse_mode=HTML."""
    return html.escape(str(texto if texto is not None else ""))


# ── Estado en memoria ─────────────────────────────────────────────────────────
_lock = threading.Lock()
_ctx_cache = {}                       # uid -> (timestamp, contexto)
_flujo = {}                           # uid -> dict con el paso actual (publicar / buscar asistencia)
_historial = defaultdict(lambda: deque(maxlen=6))   # uid -> últimos mensajes en tema para la IA
_vinc_intentos = defaultdict(deque)


def _contexto(uid: str, fresco=False) -> dict:
    ahora = time.time()
    with _lock:
        c = _ctx_cache.get(uid)
        if c and not fresco and ahora - c[0] < 20:
            return c[1]
    datos = api.contexto(uid)
    if "error" not in datos or datos.get("vinculado") is False:
        with _lock:
            _ctx_cache[uid] = (ahora, datos)
    return datos


def _invalidar(uid: str):
    with _lock:
        _ctx_cache.pop(uid, None)


def _flujo_activo(uid: str):
    with _lock:
        f = _flujo.get(uid)
        if f and time.time() - f["ts"] > TTL_FLUJO:
            _flujo.pop(uid, None)
            return None
        return f


def _set_flujo(uid: str, **datos):
    with _lock:
        f = _flujo.get(uid, {})
        f.update(datos, ts=time.time())
        _flujo[uid] = f


def _fin_flujo(uid: str):
    with _lock:
        _flujo.pop(uid, None)


# ── Teclados ──────────────────────────────────────────────────────────────────
def _teclado(rol: str):
    k = types.ReplyKeyboardMarkup(resize_keyboard=True, input_field_placeholder="Escribí tu consulta…")
    if rol == "alumno":
        k.row(B_AVISOS, B_ASIST)
        k.row(B_MATERIAS, B_AYUDA)
    elif rol in ROLES_STAFF:
        k.row(B_AVISOS, B_PUBLICAR)
        k.row(B_ASIST_ALUMNO, B_MATERIAS if rol == "profesor" else B_AYUDA)
        if rol == "profesor":
            k.row(B_AYUDA)
    else:
        return types.ReplyKeyboardRemove()
    return k


def _inline(filas):
    k = types.InlineKeyboardMarkup()
    for fila in filas:
        k.row(*[types.InlineKeyboardButton(t, callback_data=d) for t, d in fila])
    return k


# ── Textos ────────────────────────────────────────────────────────────────────
TXT_VINCULAR = (
    "Para usar el bot tenés que vincular tu cuenta del campus:\n"
    "1️⃣ Entrá al campus en tu navegador\n"
    "2️⃣ Tocá tu foto o nombre (arriba a la derecha) → <b>Telegram → Generar código</b>\n"
    "3️⃣ Mandame acá: <code>/vincular 123456</code> (con tu código)\n\n"
    "El código dura 15 minutos."
)


def _menu(rol: str) -> str:
    t = ("<b>Qué puedo hacer por vos</b>\n"
         "📋 /avisos — últimos avisos\n"
         "❓ /ayuda — este menú\n")
    if rol == "alumno":
        t += "📊 /asistencia — tu asistencia\n📚 /materias — materias de tu año\n"
    if rol == "profesor":
        t += "📚 /materias — materias que dictás\n"
    if rol in ROLES_STAFF:
        t += ("\n<b>Para el personal</b>\n"
              "📣 /aviso — publicar un aviso (también /tarea, /horario, /urgente)\n"
              "🔎 /asistencia nombre y apellido — asistencia de un alumno\n"
              "↩️ /cancelar — cortar lo que estés haciendo\n")
    t += ("\n💬 También podés <b>escribirme una pregunta</b> sobre la escuela o el campus. "
          "Solo respondo temas de la institución.")
    return t


def _fmt_aviso(a: dict, largo=220) -> str:
    emoji = TIPOS.get(a.get("tipo"), ("📣", ""))[0]
    cuerpo = (a.get("contenido") or "").strip().replace("\n", " ")
    if len(cuerpo) > largo:
        cuerpo = cuerpo[:largo].rstrip() + "…"
    t = f"{emoji} <b>{h(a.get('titulo'))}</b>\n{h(cuerpo)}\n"
    if a.get("fecha_evento"):
        t += f"📅 Actividad: <b>{h(_fecha_legible(a['fecha_evento'], a.get('todo_el_dia')))}</b>\n"
    t += f"<i>{h(a.get('autor'))} · {h(_fecha_corta(a.get('fecha')))} · {h(a.get('anio') or 'Todos los años')}</i>"
    return t


def _fecha_corta(f) -> str:
    try:
        return datetime.strptime(str(f)[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
    except ValueError:
        return str(f or "")


def _fecha_legible(f, todo_el_dia=False) -> str:
    try:
        d = datetime.strptime(str(f)[:16], "%Y-%m-%d %H:%M")
    except ValueError:
        return str(f)
    return d.strftime("%d/%m/%Y") if todo_el_dia else d.strftime("%d/%m/%Y %H:%M hs")


def parsear_fecha(texto: str, ahora=None):
    """Acepta '2026-11-05 10:00', '05/11 10:00', '05/11/2026', '5/11'. Devuelve (valor_backend, todo_el_dia) o None."""
    ahora = ahora or datetime.now()
    t = texto.strip()
    m = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2})[:.](\d{2}))?", t)
    if m:
        y, mo, d, hh, mi = m.groups()
    else:
        m = re.fullmatch(r"(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?(?:\s+(\d{1,2})[:.](\d{2}))?", t)
        if not m:
            return None
        d, mo, y, hh, mi = m.groups()
        y = int(y) + 2000 if y and len(y) == 2 else int(y or ahora.year)
    try:
        fecha = datetime(int(y), int(mo), int(d), int(hh or 0), int(mi or 0))
    except ValueError:
        return None
    todo = hh is None
    if fecha.date() < ahora.date() or (not todo and fecha < ahora):
        return "pasada"
    return (fecha.strftime("%Y-%m-%d") if todo else fecha.strftime("%Y-%m-%d %H:%M")), todo


# ── Registro de handlers ──────────────────────────────────────────────────────
def registrar_comandos(bot):

    def seguro(fn):
        """Ningún error rompe el bot: se registra y la persona recibe un mensaje claro."""
        @functools.wraps(fn)
        def envoltura(arg, *a, **kw):
            try:
                return fn(arg, *a, **kw)
            except Exception as e:  # noqa: BLE001
                print(f"[Bot] Error en {fn.__name__}: {type(e).__name__}: {e}")
                try:
                    chat = arg.message.chat.id if hasattr(arg, "message") else arg.chat.id
                    bot.send_message(chat, "⚠️ Tuve un problema. Probá de nuevo en un momento.")
                except Exception:  # noqa: BLE001
                    pass
        return envoltura

    def decir(chat_id, texto, markup=None):
        return bot.send_message(chat_id, texto[:4000], parse_mode="HTML", reply_markup=markup,
                                disable_web_page_preview=True)

    def usuario(message):
        """Devuelve el contexto de quien escribe si está vinculado; si no, explica cómo vincular."""
        uid = str(message.from_user.id)
        c = _contexto(uid)
        if c.get("vinculado"):
            return c
        if c.get("error") and c.get("vinculado") is None:
            decir(message.chat.id, f"⚠️ {h(c['error'])}")
        elif c.get("error"):
            decir(message.chat.id, f"❌ {h(c['error'])}")
        else:
            decir(message.chat.id, "👋 Todavía no tenés tu cuenta vinculada.\n\n" + TXT_VINCULAR)
        return None

    def privado(message) -> bool:
        if message.chat.type == "private":
            return True
        if message.text and message.text.startswith("/"):
            bot.reply_to(message, "🔒 Escribime por privado: acá no respondo por seguridad.")
        return False

    # ── /start ────────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["start"])
    @seguro
    def cmd_start(message):
        if not privado(message):
            return
        c = _contexto(str(message.from_user.id), fresco=True)
        if c.get("vinculado"):
            decir(message.chat.id,
                  f"👋 ¡Hola, <b>{h(c['nombre'].split(' ')[0])}</b>! Sos {h(NOMBRE_ROL.get(c['rol'], c['rol']))}"
                  + (f" de {h(c['anio'])}" if c.get("anio") else "") + ".\n\n" + _menu(c["rol"]),
                  _teclado(c["rol"]))
        elif c.get("error") and c.get("vinculado") is None:
            decir(message.chat.id, f"⚠️ {h(c['error'])}")
        else:
            decir(message.chat.id, "👋 ¡Hola! Soy el asistente de la <b>Escuela PROA Río Tercero</b>.\n\n" + TXT_VINCULAR)

    # ── /vincular <código> ────────────────────────────────────────────────────
    @bot.message_handler(commands=["vincular"])
    @seguro
    def cmd_vincular(message):
        if not privado(message):
            return
        uid = str(message.from_user.id)
        partes = message.text.split()
        if len(partes) < 2 or not re.fullmatch(r"\d{4,8}", partes[1]):
            decir(message.chat.id, "⚠️ Mandame el código así: <code>/vincular 123456</code>")
            return
        ahora = time.time()
        with _lock:
            q = _vinc_intentos[uid]
            while q and ahora - q[0] > MIN_VINCULAR[1]:
                q.popleft()
            if len(q) >= MIN_VINCULAR[0]:
                decir(message.chat.id, "⏳ Hiciste muchos intentos. Esperá unos minutos y probá de nuevo.")
                return
            q.append(ahora)
        r = api.vincular_cuenta(partes[1], uid)
        if r.get("error"):
            decir(message.chat.id, f"❌ {h(r['error'])}")
            return
        _invalidar(uid)
        c = _contexto(uid, fresco=True)
        rol = c.get("rol") or r.get("rol", "")
        decir(message.chat.id, f"✅ <b>¡Cuenta vinculada!</b> Hola, {h(r.get('nombre', ''))}.\n\n" + _menu(rol), _teclado(rol))

    # ── /ayuda ────────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["ayuda", "help", "menu"])
    @bot.message_handler(func=lambda m: m.text == B_AYUDA)
    @seguro
    def cmd_ayuda(message):
        if not privado(message):
            return
        c = usuario(message)
        if c:
            decir(message.chat.id, _menu(c["rol"]), _teclado(c["rol"]))

    # ── /avisos ───────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["avisos", "ver"])
    @bot.message_handler(func=lambda m: m.text == B_AVISOS)
    @seguro
    def cmd_avisos(message):
        if not privado(message):
            return
        c = usuario(message)
        if not c:
            return
        c = _contexto(str(message.from_user.id), fresco=True)
        avisos = (c.get("avisos") or [])[:5]
        if not avisos:
            decir(message.chat.id, "📭 No hay avisos recientes.")
            return
        decir(message.chat.id, "📋 <b>Últimos avisos</b>\n\n" + "\n\n".join(_fmt_aviso(a) for a in avisos))

    # ── /materias ─────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["materias"])
    @bot.message_handler(func=lambda m: m.text == B_MATERIAS)
    @seguro
    def cmd_materias(message):
        if not privado(message):
            return
        c = usuario(message)
        if not c:
            return
        mats = c.get("materias") or []
        if c["rol"] not in ("alumno", "profesor"):
            decir(message.chat.id, "Ese comando es para alumnos y profesores.")
        elif not mats:
            decir(message.chat.id, "📚 Todavía no hay materias cargadas para vos. Consultá en secretaría.")
        elif c["rol"] == "alumno":
            decir(message.chat.id, f"📚 <b>Materias de {h(c.get('anio') or 'tu año')}</b>\n\n" + "\n".join(
                f"• {h(m['nombre'])}" + (f" — prof. {h(m['profesor'])}" if m.get("profesor") else "") for m in mats))
        else:
            decir(message.chat.id, "📚 <b>Materias que dictás</b>\n\n" + "\n".join(
                f"• {h(m['nombre'])}" + (f" — {h(m['anio'])}" if m.get("anio") else "") for m in mats))

    # ── /asistencia ───────────────────────────────────────────────────────────
    def _mostrar_asistencia_alumno(chat_id, c):
        a = c.get("asistencia")
        if not a or not a.get("total"):
            decir(chat_id, "📊 Todavía no tenés registros de asistencia.")
            return
        s = a["stats"]
        em = {"presente": "✅", "tarde": "🕐", "ausente": "❌"}
        decir(chat_id, f"📊 <b>Tu asistencia</b> (últimos {a['total']} registros)\n\n"
                       f"✅ Presente: {s['presente']}\n🕐 Tarde: {s['tarde']}\n❌ Ausente: {s['ausente']}\n\n"
                       "<b>Últimos días</b>\n" + "\n".join(
                           f"{em.get(r['estado'], '❓')} {h(_fecha_corta(r['fecha']))}" for r in a.get("ultimos", [])))

    def _mostrar_asistencia_de(chat_id, uid, nombre):
        r = api.asistencia_de_alumno(uid, nombre)
        if r.get("error"):
            decir(chat_id, f"❌ {h(r['error'])}")
        elif r.get("coincidencias"):
            decir(chat_id, "🔍 Hay varios alumnos con ese nombre:\n" + "\n".join(f"• {h(n)}" for n in r["coincidencias"])
                  + "\n\nProbá de nuevo con el nombre y apellido completos.")
        elif r.get("message") and not r.get("alumno"):
            decir(chat_id, f"🔍 {h(r['message'])}")
        else:
            s = r.get("stats", {})
            em = {"presente": "✅", "tarde": "🕐", "ausente": "❌"}
            filas = "\n".join(f"{em.get(x['estado'], '❓')} {h(_fecha_corta(x['fecha']))}"
                              + (f" — {h(x['observacion'])}" if x.get("observacion") else "")
                              for x in r.get("registros", [])[:7])
            decir(chat_id, f"📊 <b>Asistencia de {h(r.get('alumno'))}</b>\n\n✅ Presente: {s.get('presente', 0)}\n"
                           f"🕐 Tarde: {s.get('tarde', 0)}\n❌ Ausente: {s.get('ausente', 0)}\n\n"
                           f"<b>Últimos registros</b>\n{filas or 'Sin registros'}")

    @bot.message_handler(commands=["asistencia"])
    @bot.message_handler(func=lambda m: m.text in (B_ASIST, B_ASIST_ALUMNO))
    @seguro
    def cmd_asistencia(message):
        if not privado(message):
            return
        c = usuario(message)
        if not c:
            return
        uid = str(message.from_user.id)
        if c["rol"] == "alumno":
            _mostrar_asistencia_alumno(message.chat.id, _contexto(uid, fresco=True))
            return
        if c["rol"] not in ROLES_STAFF:
            decir(message.chat.id, "❌ No tenés permiso para consultar asistencia.")
            return
        partes = message.text.split(maxsplit=1)
        if len(partes) == 2 and message.text.startswith("/"):
            _mostrar_asistencia_de(message.chat.id, uid, partes[1].strip()[:80])
        else:
            _set_flujo(uid, paso="buscar_alumno")
            decir(message.chat.id, "🔎 ¿De qué alumno? Escribí el nombre y apellido. (/cancelar para salir)")

    # ── Publicar avisos (flujo guiado) ────────────────────────────────────────
    def _empezar_publicacion(message, c, tipo=None, texto=None):
        uid = str(message.from_user.id)
        if c["rol"] not in ROLES_STAFF:
            decir(message.chat.id, "❌ Publicar avisos es solo para el personal de la escuela.")
            return
        destinos = api.anios_para_publicar(uid)
        if destinos.get("error"):
            decir(message.chat.id, f"❌ {h(destinos['error'])}")
            return
        if not destinos.get("todos") and not destinos.get("anios"):
            decir(message.chat.id, "❌ No tenés años asignados para publicar. Pedile a la dirección que cargue tus materias.")
            return
        _set_flujo(uid, paso="tipo", tipo=tipo, texto=texto, destinos=destinos, anio_id=None, anio_txt=None,
                   fecha=None, todo_el_dia=False, calendario=False)
        if tipo is None:
            decir(message.chat.id, "📣 <b>Nuevo aviso</b>\n¿De qué tipo es?",
                  _inline([[(f"{e} {n}", f"wz:t:{k}")] for k, (e, n) in TIPOS.items()] + [[("✖ Cancelar", "wz:x")]]))
        else:
            _pedir_anio(message.chat.id, uid)

    def _pedir_anio(chat_id, uid):
        f = _flujo_activo(uid)
        d = f["destinos"]
        opciones = [(a["etiqueta"], f"wz:a:{a['id']}") for a in d.get("anios", [])]
        if len(opciones) == 1 and not d.get("todos"):          # un solo año posible: se elige solo
            f.update(anio_id=int(opciones[0][1].split(":")[2]), anio_txt=opciones[0][0])
            return _pedir_texto(chat_id, uid)
        filas = [[o] for o in opciones]
        if d.get("todos"):
            filas.insert(0, [("🌐 Todos los años", "wz:a:0")])
        decir(chat_id, "🏫 ¿Para qué año es?", _inline(filas + [[("✖ Cancelar", "wz:x")]]))
        _set_flujo(uid, paso="anio")

    def _pedir_texto(chat_id, uid):
        f = _flujo_activo(uid)
        if f.get("texto"):
            return _pedir_fecha(chat_id, uid)
        _set_flujo(uid, paso="texto")
        decir(chat_id, "✍️ Escribí el texto del aviso. (/cancelar para salir)")

    def _pedir_fecha(chat_id, uid):
        f = _flujo_activo(uid)
        if f["tipo"] in ("tarea", "general"):
            _set_flujo(uid, paso="fecha")
            decir(chat_id, "📅 ¿Tiene fecha (una actividad, entrega o evento)? Si la ponés, los alumnos pueden agregarla a su "
                           "Google Calendar.\n\nEscribila así: <code>05/11 10:00</code> o <code>2026-11-05 10:00</code> "
                           "(sin hora = todo el día).",
                  _inline([[("Sin fecha", "wz:f:no")], [("✖ Cancelar", "wz:x")]]))
        else:
            _confirmar(chat_id, uid)

    def _confirmar(chat_id, uid):
        f = _flujo_activo(uid)
        e, n = TIPOS[f["tipo"]]
        resumen = (f"{e} <b>Vista previa del aviso</b>\n\n<b>Tipo:</b> {h(n)}\n<b>Para:</b> {h(f['anio_txt'] or 'Todos los años')}\n")
        if f.get("fecha"):
            resumen += (f"<b>Fecha:</b> {h(_fecha_legible(f['fecha'], f['todo_el_dia']))}\n"
                        f"<b>Invitación por mail:</b> {'sí' if f['calendario'] else 'no'}\n")
        resumen += f"\n{h(f['texto'])}"
        _set_flujo(uid, paso="confirmar")
        decir(chat_id, resumen, _inline([[("✅ Publicar", "wz:ok"), ("✖ Cancelar", "wz:x")]]))

    def _titulo(texto: str) -> str:
        primera = re.split(r"[.\n!?]", texto.strip(), maxsplit=1)[0].strip() or texto.strip()
        return primera[:70] + ("…" if len(primera) > 70 else "")

    @bot.message_handler(commands=["aviso", "tarea", "horario", "urgente"])
    @seguro
    def cmd_publicar(message):
        if not privado(message):
            return
        c = usuario(message)
        if not c:
            return
        cmd = message.text.split()[0].lstrip("/").split("@")[0].lower()
        partes = message.text.split(maxsplit=1)
        texto = partes[1].strip() if len(partes) > 1 else None
        _empezar_publicacion(message, c, tipo=COMANDO_TIPO[cmd], texto=texto[:1500] if texto else None)

    @bot.message_handler(func=lambda m: m.text == B_PUBLICAR)
    @seguro
    def btn_publicar(message):
        if not privado(message):
            return
        c = usuario(message)
        if c:
            _empezar_publicacion(message, c)

    @bot.callback_query_handler(func=lambda q: q.data and q.data.startswith("wz:"))
    @seguro
    def cb_flujo(q):
        uid = str(q.from_user.id)
        chat_id = q.message.chat.id
        accion = q.data.split(":")[1]
        f = _flujo_activo(uid)
        bot.answer_callback_query(q.id)
        try:
            bot.edit_message_reply_markup(chat_id, q.message.message_id, reply_markup=None)
        except Exception:  # noqa: BLE001
            pass
        if accion == "x":
            _fin_flujo(uid)
            decir(chat_id, "↩️ Cancelado.")
            return
        if not f:
            decir(chat_id, "⌛ Se venció lo que estabas haciendo. Empezá de nuevo con /aviso.")
            return
        valor = q.data.split(":")[2] if q.data.count(":") >= 2 else ""
        if accion == "t" and valor in TIPOS and f["paso"] == "tipo":
            _set_flujo(uid, tipo=valor)
            _pedir_anio(chat_id, uid)
        elif accion == "a" and f["paso"] == "anio":
            if valor == "0":
                if not f["destinos"].get("todos"):
                    decir(chat_id, "❌ No podés publicar para todos los años.")
                    return
                _set_flujo(uid, anio_id=None, anio_txt=None)
            else:
                elegido = next((a for a in f["destinos"]["anios"] if str(a["id"]) == valor), None)
                if not elegido:
                    decir(chat_id, "❌ Ese año no está disponible para vos.")
                    return
                _set_flujo(uid, anio_id=elegido["id"], anio_txt=elegido["etiqueta"])
            _pedir_texto(chat_id, uid)
        elif accion == "f" and f["paso"] == "fecha":
            _confirmar(chat_id, uid)
        elif accion == "c" and f["paso"] == "calendario":
            _set_flujo(uid, calendario=(valor == "1"))
            _confirmar(chat_id, uid)
        elif accion == "ok" and f["paso"] == "confirmar":
            r = api.publicar_aviso(uid, _titulo(f["texto"]), f["texto"], f["tipo"], f["anio_id"],
                                   f.get("fecha"), f.get("todo_el_dia", False), f.get("calendario", False))
            _fin_flujo(uid)
            if r.get("error"):
                decir(chat_id, f"❌ No se pudo publicar: {h(r['error'])}")
            else:
                _invalidar(uid)
                extra = "\n✉️ Se están enviando las invitaciones de calendario." if f.get("calendario") else ""
                decir(chat_id, f"✅ <b>Aviso publicado</b> para {h(f['anio_txt'] or 'todos los años')}.{extra}")

    # ── Cancelar ──────────────────────────────────────────────────────────────
    @bot.message_handler(commands=["cancelar"])
    @seguro
    def cmd_cancelar(message):
        if not privado(message):
            return
        _fin_flujo(str(message.from_user.id))
        decir(message.chat.id, "↩️ Listo, cancelado.")

    # ── /estado (solo director/secretaría) ────────────────────────────────────
    @bot.message_handler(commands=["estado"])
    @seguro
    def cmd_estado(message):
        if not privado(message):
            return
        c = usuario(message)
        if not c:
            return
        if c["rol"] not in ("director", "secretaria"):
            decir(message.chat.id, "❌ Solo dirección y secretaría.")
            return
        proveedores = ", ".join(n for n, k in (("Groq", config.GROQ_API_KEY), ("Gemini", config.GEMINI_API_KEY)) if k) or "ninguna"
        decir(message.chat.id, f"🤖 <b>Estado del bot</b>\nIA configurada: {h(proveedores)}\n"
                               f"Consultas a la IA hoy: {limitador.usadas_hoy}/{config.IA_MAX_POR_DIA_TOTAL}")

    # ── Mensajes que no son texto ─────────────────────────────────────────────
    @bot.message_handler(content_types=["photo", "document", "voice", "audio", "video", "sticker", "video_note", "location", "contact"])
    @seguro
    def cmd_no_texto(message):
        if message.chat.type == "private":
            decir(message.chat.id, "Por ahora solo entiendo mensajes de texto 🙂 Probá con /ayuda.")

    # ── Texto libre: flujos en curso, o consulta a la IA ──────────────────────
    @bot.message_handler(func=lambda m: bool(m.text) and not m.text.startswith("/") and m.text not in BOTONES)
    @seguro
    def texto_libre(message):
        if not privado(message):
            return
        c = usuario(message)
        if not c:
            return
        uid = str(message.from_user.id)
        texto = message.text.strip()
        f = _flujo_activo(uid)

        # 1) Pasos de un flujo guiado que esperan texto
        if f and f.get("paso") == "buscar_alumno":
            _fin_flujo(uid)
            _mostrar_asistencia_de(message.chat.id, uid, texto[:80])
            return
        if f and f.get("paso") == "texto":
            _set_flujo(uid, texto=texto[:1500])
            _pedir_fecha(message.chat.id, uid)
            return
        if f and f.get("paso") == "fecha":
            r = parsear_fecha(texto)
            if r == "pasada":
                decir(message.chat.id, "⚠️ Esa fecha ya pasó. Mandame una fecha futura o tocá “Sin fecha”.")
            elif r is None:
                decir(message.chat.id, "⚠️ No entendí la fecha. Probá así: <code>05/11 10:00</code> o <code>2026-11-05</code>.")
            else:
                _set_flujo(uid, fecha=r[0], todo_el_dia=r[1], paso="calendario")
                decir(message.chat.id, "✉️ ¿Querés mandar la invitación de calendario por mail a los alumnos del año?",
                      _inline([[("Sí, enviar", "wz:c:1"), ("No", "wz:c:0")], [("✖ Cancelar", "wz:x")]]))
            return
        if f and f.get("paso") in ("tipo", "anio", "calendario", "confirmar"):
            decir(message.chat.id, "👆 Elegí una de las opciones de arriba, o /cancelar para salir.")
            return

        # 2) Consulta libre
        if len(texto) > config.MAX_CARACTERES:
            decir(message.chat.id, f"✂️ Tu mensaje es muy largo (máximo {config.MAX_CARACTERES} caracteres). Resumilo un poco.")
            return
        pre = ia.prefiltro(texto)
        nombre = h(c["nombre"].split(" ")[0])
        if pre == "saludo":
            decir(message.chat.id, f"👋 ¡Hola, {nombre}! ¿En qué te ayudo? Podés escribirme tu consulta o usar el menú.")
            return
        if pre == "gracias":
            decir(message.chat.id, "¡De nada! 😊")
            return
        if pre == "inyeccion":
            decir(message.chat.id, h(ia.MSG_FUERA_DE_TEMA))
            return
        if not config.hay_ia():
            decir(message.chat.id, "🤖 La función de preguntas libres no está activada todavía. Mientras tanto podés usar /avisos, "
                                   "/asistencia o /materias.")
            return
        ok, motivo, espera = limitador.permitir(uid)
        if not ok:
            msg = {"cooldown": f"⏳ Dame {espera} segundos entre mensajes.",
                   "hora": f"⏳ Hiciste muchas consultas seguidas. Probá de nuevo en unos {espera} minutos.",
                   "dia": "😴 Hoy ya respondí muchas consultas. Probá mañana o usá /avisos, /asistencia, /materias."}[motivo]
            decir(message.chat.id, msg)
            return

        bot.send_chat_action(message.chat.id, "typing")
        c_fresco = _contexto(uid, fresco=True)          # para responder con datos al día
        r = ia.preguntar(c_fresco if c_fresco.get("vinculado") else c, list(_historial[uid]), texto)
        if r.estado == ia.OK:
            limitador.registrar(uid)
            _historial[uid].append(("usuario", texto))
            _historial[uid].append(("bot", r.texto))
            bot.send_message(message.chat.id, r.texto[:4000])         # texto plano: la IA no inyecta formato
        elif r.estado == ia.FUERA_DE_TEMA:
            limitador.registrar(uid)
            decir(message.chat.id, h(ia.MSG_FUERA_DE_TEMA))
        else:
            limitador.tocar(uid)
            decir(message.chat.id, "😕 No pude responder ahora. Probá de nuevo en un rato o usá /avisos, /asistencia o /materias.")

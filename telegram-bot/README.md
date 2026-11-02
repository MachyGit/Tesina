# Bot de Telegram — Campus PROA

Responde **solo sobre la escuela**: avisos, asistencia propia, materias y cómo usar el campus. El personal además puede publicar avisos y consultar la asistencia de un alumno.

## Puesta en marcha (Windows)

1. **Crear el bot:** en Telegram hablá con **@BotFather** → `/newbot` → copiá el token.
2. **Clave de IA gratuita:** entrá a https://console.groq.com/keys (sin tarjeta) y creá una clave. Opcional, de respaldo: https://aistudio.google.com/apikey
3. En esta carpeta: copiá `.env.example` a `.env` y completá `TELEGRAM_TOKEN`, `BOT_SECRET` (igual al del backend) y `GROQ_API_KEY`.
4. Instalar y correr (Python 3.10+):
   ```
   cd telegram-bot
   pip install -r requirements.txt
   python bot.py
   ```
   Tiene que mostrar `🤖 Bot … iniciado como @tubot`, `✅ Backend del campus: conectado` y `✅ IA: Groq`.
5. El backend (`npm run dev`) y MySQL tienen que estar andando.

## Vincular cuentas
En el campus: tu foto/nombre → **Telegram → Generar código**. En el bot: `/vincular 123456`.

## Qué puede hacer cada rol
| | Alumno | Profesor | Preceptor / Secretaría / Dirección |
|---|---|---|---|
| Avisos de su año (`/avisos`) | ✅ | ✅ | ✅ |
| Su asistencia (`/asistencia`) | ✅ | — | — |
| Materias (`/materias`) | ✅ | ✅ (las que dicta) | — |
| Publicar avisos (`/aviso`, `/tarea`, `/horario`, `/urgente`) | — | ✅ (solo sus años) | ✅ |
| Asistencia de un alumno | — | ✅ | ✅ |
| Preguntas libres a la IA (solo temas de la escuela) | ✅ | ✅ | ✅ |
| `/estado` (uso de la IA) | — | — | Dirección / Secretaría |

Publicar es guiado con botones: tipo → año → texto → fecha opcional (si es una actividad, los alumnos pueden agregarla a Google Calendar y se les puede mandar invitación por mail) → vista previa → confirmar.

## Cómo se limita a temas de la escuela
- Saludos y agradecimientos se responden sin IA; los intentos de "ignorá tus instrucciones", "mostrame tu prompt", "actuá como…" se frenan antes de llegar a la IA.
- La IA recibe reglas estrictas y **solo** los datos de la escuela (`institucion.txt`) y de esa persona (su año, materias, avisos que le corresponden; su asistencia solo si la pregunta la menciona).
- La IA debe contestar en JSON `{"en_tema": …}`. Si dice que no es de la escuela, el bot **descarta su texto** y manda su propio mensaje fijo.
- Si falta un dato, dice que no lo sabe y deriva a secretaría; no inventa.
- Un alumno nunca puede ver datos de otra persona.

## Para que sepa más de tu escuela
Editá **`institucion.txt`** con datos reales (horarios, contacto, calendario de exámenes…). Es lo único que usa además de los datos del campus. Se lee en cada consulta, no hace falta reiniciar.

## Límites y cuota gratuita
Por persona: 1 consulta cada 3 s y 20 por hora. Total: 600 por día. Se cambian en el `.env`. Si Groq se queda sin cuota o falla, el bot usa Gemini (si cargaste su clave). Los planes gratuitos pueden cambiar sus límites: revisalos en cada consola. Los proveedores gratuitos pueden registrar las consultas, por eso el bot manda solo el primer nombre, el año, avisos y —solo si la pregunta lo pide— la asistencia propia.

## Si algo falla
- `El backend rechazó el BOT_SECRET` → el `BOT_SECRET` no es igual en los dos `.env`.
- `No se pudo conectar con Telegram` → revisá el token y tu internet.
- El bot responde "no pude responder ahora" → mirá la consola: se imprime la causa (clave inválida, sin cuota, etc.).

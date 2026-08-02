# Contexto del proyecto — Anime Hub (v80 → v94)

Este documento sirve para ponerse al día del proyecto sin tener que leer
todo el código. Pégalo al empezar una conversación nueva con una IA que
vaya a trabajar sobre esta app.

---

## Qué es la app

Web de noticias de anime en español, con un asistente llamado **Ren**.
Next.js (App Router) + TypeScript + Tailwind. Supabase para cuentas y
sincronización. Groq para la IA. Es un **proyecto personal gratuito**: no
cobra, no lleva publicidad y no vende datos.

Secciones: **Noticias** (feed traducido y personalizado), **Conectar**
(apartado social, aún sin emparejamiento), **Tus gustos** (lo que la app
ha aprendido), **Ajustes**, **Perfil**, y las tres páginas legales.

Se ejecuta con `npm install` y `npm run build && npm run start`.
El modo desarrollo (`npm run dev`) no se usa para probar.

---

## Cómo se trabaja en este proyecto

- Cada cambio se entrega como **ZIP numerado** (`anime-hub-proyecto-v94.zip`)
  con el comando exacto para arrancarlo.
- Se cambia **solo lo pedido**. Nada de rediseños no solicitados.
- Se espera a que el usuario pruebe antes de seguir.
- Las explicaciones van en español; el código y los comentarios internos,
  en español también.
- El usuario tiene poca soltura con la terminal: las instrucciones deben
  ser paso a paso, con el botón exacto que hay que pulsar.
- Sube al repo con GitHub Desktop (copiar encima → Commit → Push).

---

## Lo que se construyó, y por qué

### El asistente Ren: de dar respuestas a investigar de verdad

Ren empezó respondiendo de memoria y se inventaba cosas con total
seguridad. La reconstrucción pasó por varias etapas, y cada una salió de
un fallo concreto:

**Detectar cuándo hay que buscar.** Primero era una lista de palabras
clave. Se rompía constantemente: una pregunta sin signos de interrogación
pasaba como charla, "me gustaría saber" se confundía con "me gusta", y
"3 temporada" no se reconocía porque solo se miraba "temporada 3". Ahora
lo decide **un modelo rápido** (`llama-3.1-8b-instant`) que lee las
últimas líneas de conversación, resuelve referencias como "¿y la 3?", y
devuelve el tema y las consultas de búsqueda en inglés y español. La
heurística de palabras (`researchIntent.ts`) sigue ahí solo como red de
seguridad si esa llamada falla.

**Buscar.** Se probó delegando la búsqueda en el sistema agéntico de Groq
(`groq/compound`), y fue un error: decidía por su cuenta si buscaba o no,
y cuando decidía que no, devolvía un texto convincente **sin una sola
fuente detrás**. Llegó a inventarse un tuit de un director y un documento
filtrado de un estudio que no existían. Ahora la búsqueda es propia y en
paralelo:

- `newsSearch.ts` — Google News (inglés y español) y Bing News, vía RSS
  público sin clave, con fechas reales de publicación.
- Segunda pasada para **rumores**: búsqueda web abierta (llega a X, foros
  y blogs, que la búsqueda de noticias no indexa) y Reddit vía su JSON
  público (`redditSearch.ts`).
- `animeFacts.ts` — AniList: estado de emisión, fechas, próximo episodio,
  continuaciones pendientes, web oficial y plataformas de streaming.
- `jikan.ts` — MyAnimeList como segundo testigo, más sus noticias por
  anime concreto.

**Fiabilidad.** `sourceTiers.ts` clasifica cada fuente por dominio en
oficial / prensa / sin verificar, con una lista explícita de cuentas
oficiales en redes para que un anuncio de @Crunchyroll_es cuente como
oficial y un filtrador anónimo en la misma red no. `confidence.ts` calcula
una puntuación 0-100 con **reglas fijas** (cuántas fuentes oficiales, si
AniList y MAL coinciden, cómo de reciente es lo más nuevo). El número no
lo decide el modelo a propósito: un modelo suena igual de seguro diciendo
la verdad que inventándose una fecha. Esa puntuación **no se enseña**,
pero se le inyecta a Ren para que su tono encaje.

**Regla de oro:** si no hay ninguna fuente, el material se descarta entero
y Ren tiene que decir que no ha podido comprobarlo, con prohibición
expresa de dar nombres, fechas, cifras o declaraciones que no tenga
escritas delante.

### Cómo se ve mientras trabaja

`/api/assistant/stream` es una ruta SSE que hace todo en una conexión y va
mandando eventos: pasos, fuentes, la respuesta trozo a trozo y el cierre.
La respuesta **se escribe en directo**. Las rutas clásicas
(`/api/assistant` y `/api/assistant/research`) siguen existiendo como
respaldo automático si el streaming no llega.

En pantalla, el estado se resume en **una línea rotatoria** junto al
nombre ("consultando fuentes oficiales…", "rastreando rumores…"). Se
probó enseñar panel de pasos, fuentes y medidor de confianza dentro del
chat y el usuario lo rechazó: demasiada cosa. La marca de Ren es un
destello de cuatro puntas (`Sparkle`) y "pensando" son tres destellos
titilando.

### Lo que Ren puede hacer

Etiquetas invisibles al final de su respuesta, que el cliente ejecuta:
`add_favorite`, `like_news`, `interes` (marcar que una serie le interesa),
`remember` (memoria a largo plazo) e `ir_a` (botón para ir a una sección).
Cualquier `[[...]]` que no se reconozca se borra antes de enseñarlo.

Dos protecciones que salieron de fallos reales:
- `remember` **no puede guardar un supuesto nombre del usuario**. Ren se
  inventó uno, se archivó, y volvía en cada conversación como dato real.
- `interes` no guarda nada hasta comprobar contra AniList que existe y que
  el título devuelto se parece al preguntado. Sin eso, preguntar "¿qué es
  Valorant?" metía un videojuego en la lista de series seguidas.

### Aprendizaje y personalización

`learning.ts` acumula afinidad por géneros y estudios con pesos distintos
(clic = 1, preguntar por algo = 2, me gusta = 4) y guarda **de qué series
viene cada afinidad**, para poder explicarla en cristiano: nadie sabe qué
es CloverWorks, pero sí reconoce lo que ha visto. Los géneros se traducen
al enseñarlos (`genreNames.ts`) pero se guardan en inglés, que es como
llegan de las fuentes.

### Sincronización entre dispositivos

Tabla `user_state` en Supabase con las preferencias y la memoria de Ren en
JSON. Se sube con retardo tras cada cambio y se baja al abrir o al iniciar
sesión (`cloudSync.ts`, montado en el layout con `CloudSyncGate`). Gana
siempre la versión con la marca de tiempo más reciente: si borras un
recuerdo en el móvil, no debe resucitar porque el ordenador tenía una
copia vieja. **Sin cuenta todo sigue funcionando en local.**

### Apartado social (en construcción)

De momento solo crea el perfil: alias, fecha de nacimiento, con quién
quiere coincidir. **Solo mayores de 18**, comprobado en el formulario y
también como restricción en la base de datos. El alias es único (índice
sobre `lower(alias)`; no se puede comprobar antes porque cada persona solo
lee su propia fila). Las tablas de bloqueos y denuncias ya existen: se
pueden crear denuncias pero no leerlas ni borrarlas desde la app.

Queda pendiente: el emparejamiento, el chat y la revelación progresiva del
perfil. El orden acordado es texto antes que voz, y no abrirlo hasta que
haya alguien leyendo las denuncias.

### Legal

`/legal/terminos`, `/legal/privacidad` y `/legal/normas`, enlazadas desde
un pie permanente. `src/config/legal.ts` centraliza los datos y las
versiones. Al ser un proyecto gratuito, NIF y domicilio son **opcionales**
(si están vacíos, no se muestran); nombre y correo de contacto no lo son.
La aceptación es obligatoria en el onboarding y se guarda con fecha y
versión.

---

## Cosas que ya se intentaron y NO funcionaron

Para no repetirlas:

- **Delegar la búsqueda en `groq/compound`.** Devolvía cero fuentes y
  texto inventado.
- **Detectar preguntas con expresiones regulares.** Se rompe con
  sinónimos, otro idioma o palabras a medias.
- **Enseñar la confianza antes de la respuesta.** Es valorar algo que aún
  no se ha dicho.
- **Meter a Ren en la cola de tareas de fondo.** Esperaba a que
  terminaran las traducciones del feed: 15-20 segundos para responder a
  un "hola".
- **Paneles de pasos, fuentes y confianza dentro del chat.** Demasiada
  información; el usuario los quitó.
- **Campos nativos del navegador** (fecha, casillas). Se ven del sistema
  operativo y rompen la estética. Hay componentes propios.

---

## Errores sutiles que costaron encontrar

- Las respuestas salían como un bloque ilegible porque faltaba
  `whitespace-pre-wrap`: Ren sí separaba en líneas, pero se aplastaban.
- El filtro para no buscar en frases de opinión cogía la raíz "me gust" y
  se tragaba "me gustaría saber", que es justo lo contrario.
- En móvil, `100vh` incluye lo que tapa la barra del navegador, así que
  todo lo anclado abajo caía fuera de pantalla. Se usa `100dvh` y
  `env(safe-area-inset-bottom)`.
- AniList siempre devuelve algo parecido de nombre aunque le preguntes por
  algo que no es un anime. Hay que comparar el resultado con lo pedido.

---

## Criterios que se han seguido

- **Nunca afirmar sin respaldo.** Antes decir "no lo sé" que rellenar.
- **Separar siempre lo confirmado de lo que se rumorea**, pero contar los
  rumores: el usuario quiere saber qué se dice.
- **Que el usuario pueda ver y borrar** todo lo que la app sabe de él.
- **Degradación elegante:** si una fuente falla, las demás siguen. Si
  Supabase no responde, la app funciona en local. Si el streaming se
  corta, hay ruta de respaldo.
- **Estética:** fondo negro tinta, paneles carbón, paleta fría, tipografía
  Shippori Mincho para títulos, animaciones sutiles y rápidas. Se rechazó
  expresamente la paleta cálida por parecer "genérica de IA".
- **Comentar el porqué, no el qué.** Los comentarios del código explican
  qué fallo se está evitando, no lo que hace la línea siguiente.

---

## Pendientes acordados

1. **Caché de investigaciones** — misma pregunta en unas horas, respuesta
   instantánea y sin gastar cuota. Hay un patrón ya hecho en
   `translationCache.ts`.
2. **Ren proactivo** al abrir la app ("hay fecha nueva para la serie que
   me preguntaste").
3. **Emparejamiento y chat** en Conectar.
4. **Apartado de lista personal**: buscar anime, añadirlo, valorarlo, ver
   estadísticas.
5. **Más fuentes de noticias**, con enfoque España pero variadas.
6. **Voz** (Groq tiene transcripción y síntesis).

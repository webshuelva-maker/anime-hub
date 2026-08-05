# Informe: el archivo de noticias de MyAnimeList

**Estado: causa de fondo encontrada y corregida en v184.** Queda una
comprobación de red pendiente por parte del usuario.

Este documento sustituye al informe anterior. La versión previa contenía
un razonamiento erróneo que mandó la investigación por el camino
equivocado durante tres intentos; se explica en el apartado 4 para que no
se repita.

---

## 1. El proyecto

**Anime Hub**: web de noticias de anime en español.

- Next.js 16 (App Router), TypeScript, Tailwind, React 19.
- Se ejecuta en local con `npm install` y `npm run build && npm run start`
  (nunca en modo `dev`), en `http://localhost:3000`.
- También está desplegada en Vercel.
- Supabase para cuentas; irrelevante para este fallo.

## 2. Qué hace la funcionalidad

Las noticias del feed vienen de canales RSS de medios españoles, y un RSS
solo publica lo reciente: no hay forma de pedirle lo de hace meses.

Para cubrir eso, cuando alguien busca una serie y **el feed no encuentra
ninguna noticia suya**, la app consulta el historial que MyAnimeList
mantiene para esa serie, a través de la API pública **Jikan**
(`https://api.jikan.moe/v4`, gratuita, sin clave, límite de 3 peticiones
por segundo y 60 por minuto).

Flujo:

1. El usuario busca, por ejemplo, `Violet Evergarden`.
2. `/api/anime-search` consulta AniList + Jikan + Kitsu y devuelve las
   fichas **y el `malId`** del mejor resultado.
3. Si no hay noticias en el feed, `NoticiasDeArchivo` llama a
   `/api/anime-noticias?titulo=...&malId=...`.
4. Esa ruta pide `/anime/{malId}/news` a Jikan y devuelve la lista.

## 3. El síntoma original

Buscando `Violet Evergarden` (id **33352** en MyAnimeList, con decenas de
noticias), en pantalla salía:

```
No se ha podido consultar el archivo de MyAnimeList.
no se encontró la serie en MyAnimeList
```

## 4. LA CAUSA DE FONDO (encontrada en v184)

**`/api/anime-search` no devolvía el campo `malId`.** Nunca. El
componente lee `data.malId` y se lo pasa a la ruta del archivo, pero esa
ruta no incluía ese campo en su respuesta JSON. Comprobable con un
`grep malId src/app/api/`: el único sitio del servidor donde aparecía era
la ruta del archivo *leyéndolo* de la URL. Nadie lo escribía.

Dos consecuencias, y las dos importan:

### 4.1. El arreglo del límite de peticiones nunca estuvo activo

Se dio por descartada la hipótesis del 429 razonando que se había
reducido de tres llamadas a dos pasando el `malId`. Esa reducción **nunca
ocurrió**: al llegar vacío, el archivo seguía haciendo su propia
búsqueda. Siempre fueron tres llamadas casi simultáneas, justo en el
límite de 3/s de Jikan. La hipótesis del límite no estaba descartada,
estaba **sin probar**.

### 4.2. El razonamiento que invalidó la investigación

El informe anterior decía: «`malId` llegó vacío ⟹ ninguna llamada a Jikan
funciona desde ese equipo». **Ese razonamiento es inválido**, porque
`malId` venía vacío por construcción, funcionara Jikan o no. Sobre esa
falsa evidencia se construyó la hipótesis principal (el equipo no alcanza
`api.jikan.moe`), que quedó así sin ningún apoyo real.

Lección: antes de acusar a la red, verificar que el dato que se dice
«vacío» llega a escribirse en algún sitio.

## 5. Qué se ha cambiado en v184

Todo verificado de punta a punta contra un servidor Jikan **simulado** en
local (ver apartado 7), porque el entorno donde se hizo el arreglo no
tiene salida a `api.jikan.moe`.

| Cambio | Archivo | Verificado |
|---|---|---|
| Se devuelve `malId`, emparejando el mejor resultado con el de MyAnimeList por núcleo de título | `api/anime-search/route.ts` | Sí: `malId: 33352` |
| Cola de peticiones con 400 ms de hueco (2,5/s, bajo el límite de 3/s) | `lib/jikan.ts` | Sí: huecos medidos de 400 ms |
| Se respeta la cabecera `Retry-After` ante un 429 | `lib/jikan.ts` | Sí: se recupera de un 429 |
| El cronómetro arranca al salir de la cola, no antes | `lib/jikan.ts` | Evita abortos falsos |
| Reintento con el título recortado si la búsqueda funcionó pero volvió vacía | `api/anime-noticias/route.ts` | Sí |
| `JIKAN_BASE_URL` para apuntar a un espejo o proxy | `lib/jikan.ts` | Sí |
| Diagnóstico ampliado con veredicto escrito | `api/diagnostico-mal/route.ts` | Sí |

## 6. Lo que queda por comprobar (red)

Sigue sin descartarse que ese equipo concreto no alcance
`api.jikan.moe`. Dos comprobaciones, de menor a mayor esfuerzo:

**La barata (10 segundos).** Buscar cualquier serie y mirar el campo
`debug` de la respuesta de `/api/anime-search`:

- `myanimelist: 8` → Jikan es alcanzable. La red queda descartada.
- `myanimelist: 0` de forma constante → sospecha confirmada, seguir abajo.

**La completa.** Abrir `http://localhost:3000/api/diagnostico-mal` **con
la app encendida**. Da un veredicto escrito. Prueba la misma dirección
con tres juegos de cabeceras (las de la app, una de navegador y ninguna),
más un sitio de control, y distingue:

| Veredicto | Arreglo |
|---|---|
| Sí llega a MyAnimeList | El fallo está en el código o en el ritmo; no es la red |
| Ni MyAnimeList ni el control | No hay salida a internet |
| Internet sí, Jikan mudo | DNS, cortafuegos o antivirus filtrando ese dominio, o Jikan caído |
| 429 | Subir `HUECO_MS` en `src/lib/jikan.ts` |
| 403 solo con las cabeceras de la app | Bloqueo por User-Agent: cambiarlo en `src/lib/jikan.ts` |
| 403 con todas las cabeceras | Antivirus con inspección de TLS, proxy de red o Cloudflare bloqueando el dominio entero |

Si resulta ser bloqueo del dominio, `JIKAN_BASE_URL` permite apuntar a un
espejo sin tocar código. Y probarlo desde Vercel separa «este equipo» de
«la app».

## 7. Cómo reproducir las pruebas sin depender de Jikan

`JIKAN_BASE_URL` permite levantar un servidor de mentira que responda
como Jikan y ejercitar el camino entero: búsqueda, `malId`, archivo,
espaciado de la cola y recuperación de un 429. Es como se validó v184.

```bash
JIKAN_BASE_URL="http://127.0.0.1:3999/v4" npm run start
```

## 8. Nota

Todo esto es un **extra**: si el archivo de MyAnimeList falla, la app
funciona igual y solo se pierde el historial de noticias antiguas de una
serie. No es un fallo bloqueante.

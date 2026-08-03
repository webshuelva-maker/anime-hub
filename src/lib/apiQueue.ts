// Todo lo que llama a la API de Groq (traducción de tarjetas,
// traducción de detalle, Y el asistente Ren) pasa por AQUÍ para que el
// navegador nunca tenga más de UNA petición en vuelo a la vez.
//
// Motivo: el síntoma reportado (solo el primer lote de tarjetas se
// traduce, el detalle se queda "traduciendo..." sin fin, y Ren se corta
// con "los servidores están más llenos de lo normal") encaja con un
// límite de CONCURRENCIA por clave de API en el tier gratuito de Groq
// — probablemente 1 sola petición en vuelo a la vez para toda la clave,
// compartida por los tres consumidores (tarjetas, detalle y Ren).
type Priority = "high" | "normal";
interface Task {
  fn: () => Promise<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
}

const queue: Task[] = [];
let running = false;

function runNext() {
  if (running) return;
  const task = queue.shift();
  if (!task) return;
  running = true;
  task.fn().then(
    (v) => {
      running = false;
      task.resolve(v);
      runNext();
    },
    (e) => {
      running = false;
      task.reject(e);
      runNext();
    }
  );
}

export function runExclusive<T>(fn: () => Promise<T>, priority: Priority = "normal"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const task: Task = { fn, resolve: resolve as (v: unknown) => void, reject };
    if (priority === "high") {
      queue.unshift(task);
    } else {
      queue.push(task);
    }
    runNext();
  });
}

// Ren tiene prioridad en la cola, pero eso no evita que el presupuesto
// de tokens/minuto de Groq ya esté agotado por la traducción de fondo
// justo cuando el usuario le habla (la cola solo decide el ORDEN, no
// libera cupo ya gastado). Mientras Ren está esperando respuesta, la
// traducción de fondo de la lista se pausa del todo — unos segundos
// de retraso en traducir tarjetas es mucho menos grave que Ren fallando
// en mitad de una conversación activa.
let backgroundPaused = false;

/*
 * Cuándo se usó Iris por última vez.
 *
 * Sirve para mover el techo de la traducción de fondo (ver
 * techoDeFondo() más abajo). Mientras nadie está hablando con
 * ella no tiene sentido reservarle cuota: que la traducción aproveche
 * todo lo que pueda.
 */
let ultimoUsoAsistente = 0;

export function setBackgroundPaused(paused: boolean) {
  backgroundPaused = paused;
  // Se marca al pausar Y al reanudar: la conversación sigue "reciente"
  // justo después de responder, que es cuando más probable es que el
  // usuario escriba otra vez.
  ultimoUsoAsistente = Date.now();
}

/** ¿Se ha usado el asistente en los últimos dos minutos? */
function asistenteEnUsoReciente(): boolean {
  return Date.now() - ultimoUsoAsistente < 120_000;
}

export function waitWhileBackgroundPaused(): Promise<void> {
  if (!backgroundPaused) return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (!backgroundPaused) resolve();
      else setTimeout(check, 300);
    };
    check();
  });
}

// Control de presupuesto de tokens/minuto: en vez de pausas fijas "a
// ciegas" entre peticiones, se lleva un registro de cuánto se ha
// consumido (estimado) en los últimos 60s, y antes de cada llamada se
// espera lo justo para no pasarse de un límite prudente. El límite real
// El límite real del plan gratuito ya no es una suposición: lo dijo el
// propio Groq en un error 429 —"tokens per minute (TPM): Limit 6000"—.
// Se deja margen por debajo porque la cuenta es por ORGANIZACIÓN, no por
// navegador: este contador solo ve lo que gasta esta pestaña, así que si
// hay otra abierta (o el móvil a la vez) el gasto real es mayor.
const SAFE_TPM_BUDGET = 5200;

/*
 * Cuánto puede gastar la traducción de fondo. NO es un porcentaje fijo:
 * depende de si se ha usado el asistente hace poco.
 *
 * Sin conversación reciente, la traducción aprovecha casi todo el
 * presupuesto (85%): no tiene sentido dejar cuota parada esperando a
 * alguien que no está escribiendo.
 *
 * Con conversación reciente baja al 35%, y aquí está el motivo de que no
 * pueda ser 100% siempre: el límite de Groq es una ventana MÓVIL de 60
 * segundos, así que cuenta lo gastado en el último minuto. Si la
 * traducción se lo hubiera comido todo justo antes de que el usuario
 * escriba, Iris llegaría a un presupuesto ya agotado y tendría que
 * esperar igual, aunque en ese instante no se estuviera traduciendo
 * nada. Dejando margen mientras hay conversación, la respuesta sale al
 * momento.
 */
function techoDeFondo(): number {
  return SAFE_TPM_BUDGET * (asistenteEnUsoReciente() ? 0.35 : 0.85);
}
const tokenLog: { time: number; tokens: number }[] = [];

function pruneOldUsage() {
  const cutoff = Date.now() - 60_000;
  while (tokenLog.length && tokenLog[0].time < cutoff) tokenLog.shift();
}

function currentUsage(): number {
  pruneOldUsage();
  return tokenLog.reduce((sum, e) => sum + e.tokens, 0);
}

export function recordTokenUsage(estimatedTokens: number) {
  tokenLog.push({ time: Date.now(), tokens: estimatedTokens });
}

export async function waitForTokenBudget(
  estimatedTokens: number,
  priority: Priority = "normal",
  maxWaitMs = Infinity
): Promise<void> {
  // Se calcula en cada llamada, no una vez al cargar: el techo del
  // fondo cambia según se esté usando el asistente o no.
  const ceiling = priority === "high" ? SAFE_TPM_BUDGET : techoDeFondo();
  const deadline = Date.now() + maxWaitMs;

  // Con tope de espera. Sin él, si el presupuesto estaba gastado por la
  // traducción de fondo, Ren se quedaba esperando en bucles de un segundo
  // ANTES de mandar nada — y desde fuera parecía simplemente que tardaba
  // veinte segundos en contestar a un "hola". Para algo que el usuario
  // está esperando en pantalla, es preferible arriesgarse a un 429 (que
  // ya tiene reintento) que hacerle esperar en seco.
  while (currentUsage() + estimatedTokens > ceiling) {
    if (Date.now() >= deadline) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

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

export function setBackgroundPaused(paused: boolean) {
  backgroundPaused = paused;
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
// del plan gratuito de Groq no está documentado con precisión (varía
// según fuentes entre 6.000 y 30.000 tokens/minuto) — 5.500 es un valor
// conservador para no agotarlo aunque el real sea el más bajo.
const SAFE_TPM_BUDGET = 5500;
// La traducción de fondo (lista) NUNCA puede gastar más del 65% del
// presupuesto — así siempre queda un margen reservado para Ren y para
// el detalle, que no deberían depender de que la lista les "deje hueco".
const BACKGROUND_TPM_CEILING = SAFE_TPM_BUDGET * 0.65;
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

export async function waitForTokenBudget(estimatedTokens: number, priority: Priority = "normal"): Promise<void> {
  const ceiling = priority === "high" ? SAFE_TPM_BUDGET : BACKGROUND_TPM_CEILING;
  while (currentUsage() + estimatedTokens > ceiling) {
    await new Promise((r) => setTimeout(r, 1000));
  }
}

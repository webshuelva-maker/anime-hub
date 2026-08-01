// Todo lo que llama a la API de NVIDIA (traducción de tarjetas,
// traducción de detalle, Y el asistente Ren) pasa por AQUÍ para que el
// navegador nunca tenga más de UNA petición en vuelo a la vez.
//
// Motivo: el síntoma reportado (solo el primer lote de tarjetas se
// traduce, el detalle se queda "traduciendo..." sin fin, y Ren se corta
// con "los servidores están más llenos de lo normal") encaja con un
// límite de CONCURRENCIA por clave de API en el tier gratuito de NVIDIA
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

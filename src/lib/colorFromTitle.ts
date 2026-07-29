// Paleta de acentos fríos y apagados. Cada anime recibe siempre el mismo
// color, calculado a partir de su nombre — así "Espada del Ocaso" se ve
// siempre distinto de "Reino de Cenizas", sin depender de una imagen real.
const TITLE_PALETTE = [
  "#7fa8c9", // azul hielo
  "#8d9fc0", // acero
  "#7fb3a3", // verde grisáceo
  "#a3959c", // malva apagado
  "#8aa5b0", // azul pizarra
  "#b0a48a", // arena fría
  "#7f9cae", // azul niebla
  "#9c8fae", // violeta apagado
  "#7fae9c", // teal apagado
  "#aeaa7f", // oliva pálido
];

export function colorFromTitle(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % TITLE_PALETTE.length;
  return TITLE_PALETTE[index];
}

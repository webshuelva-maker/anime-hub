"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * Fundido de entrada al cambiar de sección.
 *
 * En la PRIMERA carga no se hace. La barra superior vive en el layout, o
 * sea fuera de esto, y aparece de golpe; el contenido (incluida la
 * pantalla de carga inicial) iba dentro y tardaba 0,22s en llegar a
 * opacidad completa. Ese hueco es justo lo que se veía al abrir la app en
 * el móvil: asomaba media home con la barra, y acto seguido entraba la
 * pantalla de carga tapándolo todo.
 */
let yaSeMontoUnaVez = false;

export default function Template({ children }: { children: React.ReactNode }) {
  const [esPrimeraCarga] = useState(() => !yaSeMontoUnaVez);

  useEffect(() => {
    yaSeMontoUnaVez = true;
  }, []);

  return (
    <motion.div
      // initial={false} le dice a framer-motion "empieza ya en el estado
      // final, sin animar" — nada de fundido en el primer pintado.
      initial={esPrimeraCarga ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="flex flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Avatar } from "./AvatarPicker";
import { createClient } from "@/lib/supabase/client";
import { getPreferences } from "@/lib/storage";
import { playError, playSuccess } from "@/lib/sound";
import { caratulasDe, esperandoRespuesta, cuantosTeEsperan, misCoincidencias } from "@/lib/conectar";

/**
 * Tu perfil, tal y como lo ve la gente.
 *
 * ---------------------------------------------------------------------
 * POR QUÉ SE REHACE (v163)
 *
 * Era una lista de tres líneas: alias, cómo te identificas, con quién
 * quieres coincidir. Ni el avatar, ni la descripción, ni los gustos que
 * deciden con quién encajas. O sea que la pantalla llamada "tu perfil"
 * no enseñaba tu perfil: enseñaba tres campos de un formulario.
 *
 * Ahora lo que se ve aquí es LA MISMA FICHA que le sale a los demás,
 * montada con los mismos elementos. Eso convierte la pantalla en algo
 * accionable: si te ves soso, lo estás viendo con sus ojos y puedes
 * arreglarlo ahí mismo. Antes no había forma de saber cómo te veían.
 *
 * Y la descripción se edita aquí, sin salir. Se volvió obligatoria hace
 * dos versiones, así que todos los perfiles creados antes la tienen
 * vacía y no había ningún sitio donde rellenarla.
 * ---------------------------------------------------------------------
 */

const SUAVE = [0.16, 1, 0.3, 1] as const;
const BIO_MINIMA = 40;

interface PerfilSocial {
  alias: string;
  birthdate: string;
  gender: string;
  looking_for: string[];
  bio: string | null;
}

function edadDe(fecha: string): number {
  const d = new Date(fecha);
  const hoy = new Date();
  let edad = hoy.getFullYear() - d.getFullYear();
  const m = hoy.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < d.getDate())) edad--;
  return edad;
}

export function PerfilSocialVista({
  perfil,
  onSalir,
}: {
  perfil: PerfilSocial;
  onSalir: () => void;
}) {
  const [bio, setBio] = useState(perfil.bio ?? "");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [caratulas, setCaratulas] = useState<Record<string, string>>({});
  const [numeros, setNumeros] = useState({ coincidencias: 0, esperando: 0, teEsperan: 0 });
  // Las preferencias se leen una vez con el inicializador perezoso de
  // useState. Con una referencia el linter protesta (leer .current
  // durante el dibujado no está permitido) y con un efecto habría un
  // parpadeo con la ficha vacía.
  const [prefs] = useState(() => getPreferences());

  const favoritos = (prefs.favoriteTitles ?? []).slice(0, 6);
  const generos = (prefs.genres ?? []).slice(0, 6);
  const bioGuardada = perfil.bio ?? "";
  const hayCambios = bio.trim() !== bioGuardada.trim();

  useEffect(() => {
    let vivo = true;
    const id = setTimeout(async () => {
      const [c, m, e, t] = await Promise.all([
        favoritos.length ? caratulasDe(favoritos) : Promise.resolve({}),
        misCoincidencias(),
        esperandoRespuesta(),
        cuantosTeEsperan(),
      ]);
      if (!vivo) return;
      setCaratulas(c);
      setNumeros({ coincidencias: m.length, esperando: e, teEsperan: t });
    }, 0);
    return () => {
      vivo = false;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardarBio = async () => {
    if (bio.trim().length < BIO_MINIMA) {
      playError();
      setAviso(`Te faltan ${BIO_MINIMA - bio.trim().length} caracteres.`);
      return;
    }
    setGuardando(true);
    setAviso(null);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { error } = await supabase
        .from("social_profiles")
        .update({ bio: bio.trim() })
        .eq("user_id", auth.user.id);
      if (error) {
        playError();
        setAviso("No se ha podido guardar. Inténtalo otra vez.");
        return;
      }
      playSuccess();
      perfil.bio = bio.trim();
      setGuardado(true);
      setTimeout(() => setGuardado(false), 2200);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* --- La ficha, montada igual que la que ven los demás --------- */}
      <div className="panel overflow-hidden rounded-2xl">
        <div className="relative px-6 pb-5 pt-7">
          {Object.keys(caratulas).length > 0 && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex overflow-hidden"
              style={{
                maskImage: "linear-gradient(to bottom, black 0%, transparent 92%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 0%, transparent 92%)",
              }}
            >
              {favoritos
                .filter((t) => caratulas[t])
                .slice(0, 4)
                .map((t) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={t}
                    src={caratulas[t]}
                    alt=""
                    className="h-full flex-1 object-cover opacity-[0.18]"
                    loading="lazy"
                  />
                ))}
            </div>
          )}

          <div className="relative flex items-center gap-4">
            <Avatar avatarId={prefs.avatarId ?? ""} size="xl" rounded="full" />
            <div className="min-w-0">
              <p className="font-heading text-2xl font-bold leading-tight">{perfil.alias}</p>
              <p className="mt-0.5 text-sm text-muted">
                {edadDe(perfil.birthdate)} años · {perfil.gender}
              </p>
              <p className="mt-2 text-[11px] text-muted">
                Quieres coincidir con {perfil.looking_for.join(", ").toLowerCase()}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
          {favoritos.length > 0 && (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                Lo que enseñas
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {favoritos.map((t) => (
                  <span
                    key={t}
                    className={`flex items-center gap-2 rounded-full border text-xs ${
                      caratulas[t] ? "py-1 pl-1 pr-3" : "px-2.5 py-1"
                    }`}
                    style={{
                      borderColor: "color-mix(in srgb, var(--ice) 45%, transparent)",
                      color: "var(--ice)",
                      background: "color-mix(in srgb, var(--ice) 10%, transparent)",
                    }}
                  >
                    {caratulas[t] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={caratulas[t]}
                        alt=""
                        className="h-6 w-6 shrink-0 rounded-full object-cover"
                        loading="lazy"
                      />
                    )}
                    {t}
                  </span>
                ))}
                {generos.map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-panel-border px-2.5 py-1 text-xs text-muted"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </>
          )}

          {favoritos.length === 0 && (
            <p className="rounded-xl border border-panel-border px-4 py-3 text-xs leading-relaxed text-muted">
              No tienes favoritos marcados, así que ahora mismo no compartes nada con nadie y sales
              de los últimos. Márcalos en{" "}
              <a href="/preferencias" className="ice-text hover:underline">
                Tus gustos
              </a>{" "}
              y esta ficha se llena sola.
            </p>
          )}

          <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {bioGuardada || (
              <span className="text-muted">Todavía no has escrito nada sobre ti.</span>
            )}
          </p>
        </div>
      </div>

      {/* --- Números ---------------------------------------------------- */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { valor: numeros.coincidencias, texto: "coincidencias" },
          { valor: numeros.teEsperan, texto: "te han marcado" },
          { valor: numeros.esperando, texto: "esperando respuesta" },
        ].map((n) => (
          <div key={n.texto} className="panel rounded-2xl px-3 py-4 text-center">
            <p className="font-heading text-2xl font-bold">{n.valor}</p>
            <p className="mt-0.5 text-[11px] leading-tight text-muted">{n.texto}</p>
          </div>
        ))}
      </div>

      {/* --- Editar la descripción ------------------------------------- */}
      <div className="panel rounded-2xl p-6">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted">
          Algo sobre ti
        </h2>
        <p className="mt-1 text-xs leading-snug text-muted">
          Es lo único que las demás personas pueden leer antes de decidir.
        </p>
        <textarea
          value={bio}
          onChange={(e) => {
            setBio(e.target.value);
            if (aviso) setAviso(null);
          }}
          maxLength={280}
          rows={4}
          placeholder="Ej.: Llevo el verano con Frieren y me ha destrozado. Me van las series lentas y los finales tristes."
          className="mt-3 w-full resize-none rounded-xl border border-panel-border bg-panel-soft/50 px-3 py-2 text-sm outline-none transition-colors duration-200 focus:border-ice/50"
        />
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-[11px] text-muted">
            {bio.trim().length < BIO_MINIMA
              ? `Te faltan ${BIO_MINIMA - bio.trim().length} caracteres`
              : `${bio.length}/280`}
          </p>
          <AnimatePresence mode="wait">
            {hayCambios && (
              <motion.button
                key="guardar"
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2, ease: SUAVE }}
                onClick={guardarBio}
                disabled={guardando}
                className="accent-gradient pulsable rounded-full px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                {guardando ? "Guardando…" : "Guardar"}
              </motion.button>
            )}
            {guardado && !hayCambios && (
              <motion.span
                key="guardado"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="ice-text text-xs"
              >
                Guardado
              </motion.span>
            )}
          </AnimatePresence>
        </div>
        {aviso && <p className="mt-2 text-xs text-rumor">{aviso}</p>}
      </div>

      {/* --- Salir ------------------------------------------------------ */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onSalir}
          className="pulsable rounded-full border border-panel-border px-4 py-2 text-sm font-medium text-muted hover:border-rumor/50 hover:text-rumor"
        >
          Salir de Conectar y borrar este perfil
        </button>
      </div>
    </div>
  );
}

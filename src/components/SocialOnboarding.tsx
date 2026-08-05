"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { legalConfig } from "@/config/legal";
import { siteConfig } from "@/config/site";
import { SelectableChip } from "./SelectableChip";
import { DateOfBirthPicker } from "./DateOfBirthPicker";
import { CheckBox } from "./CheckBox";
import { ConfirmDialog } from "./ConfirmDialog";
import { ConectarShell } from "./ConectarShell";
import { PerfilSocialVista } from "./PerfilSocialVista";
import { playError, playSuccess } from "@/lib/sound";

/**
 * Alta en el apartado social. Primera pieza de la sección: todavía no
 * empareja a nadie — crea el perfil, comprueba la edad y deja registrada
 * la aceptación de las normas.
 *
 * Ese orden es deliberado. Emparejar es lo divertido, pero sin perfil
 * consentido y sin barrera de edad no se puede emparejar a nadie sin
 * asumir un riesgo que no merece la pena.
 *
 * La edad se comprueba en DOS sitios: aquí, para poder explicarlo bien, y
 * en la propia base de datos con una restricción, para que no dependa de
 * que el navegador se porte bien.
 */

const GENDERS = ["Mujer", "Hombre", "No binario", "Prefiero no decirlo"];
const LOOKING_FOR = ["Mujeres", "Hombres", "Personas no binarias", "Me da igual"];

interface SocialProfile {
  alias: string;
  birthdate: string;
  gender: string;
  looking_for: string[];
  bio: string | null;
  is_active: boolean;
}

function yearsOld(birthdate: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return null;
  const born = new Date(birthdate);
  if (isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const monthDiff = now.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) age -= 1;
  return age;
}

/*
 * Una edad autodeclarada no se puede verificar sin pedir un documento, y
 * aquí no se va a hacer. Pero sí se puede evitar lo fácil: que alguien
 * ponga su fecha real, la app le conteste "eres menor de 18", y entonces
 * la cambie sabiendo ya exactamente qué hace falta poner. Eso convierte
 * el aviso en un tutorial.
 *
 * Así que la primera vez que alguien declara ser menor, queda anotado y
 * el formulario se cierra: no basta con corregir la fecha. Se puede
 * saltar borrando datos del navegador — todo lo que vive en el cliente se
 * puede — pero deja de ser el camino evidente, y la declaración queda
 * hecha. El bloqueo de verdad está en la base de datos (restricción de
 * edad + fecha de nacimiento inmutable, ver supabase/schema.sql).
 */
const MENOR_KEY = "anime-hub:social-menor-declarado";

function yaDeclaroSerMenor(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MENOR_KEY) === "1";
  } catch {
    return false;
  }
}

function anotarDeclaracionDeMenor() {
  try {
    window.localStorage.setItem(MENOR_KEY, "1");
  } catch {
    // Sin localStorage el bloqueo se pierde, pero la restricción de la
    // base de datos sigue en pie.
  }
}

export function SocialOnboarding() {
  const [loading, setLoading] = useState(true);
  const [bloqueadoPorEdad, setBloqueadoPorEdad] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<SocialProfile | null>(null);

  const [alias, setAlias] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState("");
  const [lookingFor, setLookingFor] = useState<string[]>([]);
  const [bio, setBio] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  useEffect(() => {
    // Depende de localStorage, así que no puede resolverse en el render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (yaDeclaroSerMenor()) setBloqueadoPorEdad(true);
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        setUserId(null);
        setLoading(false);
        return;
      }
      setUserId(data.user.id);
      const { data: row } = await supabase
        .from("social_profiles")
        .select("alias, birthdate, gender, looking_for, bio, is_active")
        .eq("user_id", data.user.id)
        .maybeSingle<SocialProfile>();
      if (row) setProfile(row);
      setLoading(false);
    });
  }, []);

  const age = yearsOld(birthdate);
  const isAdult = age !== null && age >= legalConfig.edadMinimaSocial;

  const handleSubmit = async () => {
    setError(null);

    if (alias.trim().length < 2) return setError("Ponte un alias, aunque sea corto.");
    if (age === null) return setError("Necesito tu fecha de nacimiento completa.");
    if (!isAdult) {
      playError();
      anotarDeclaracionDeMenor();
      setBloqueadoPorEdad(true);
      return;
    }
    if (age > 120) return setError("Esa fecha no parece correcta.");
    if (!gender) return setError("Elige una opción en «cómo te identificas».");
    if (lookingFor.length === 0) return setError("Elige con quién quieres coincidir.");
    /*
     * La descripción pasa a ser obligatoria y con un mínimo real.
     *
     * Siendo opcional, casi nadie la escribía, y sin nada que leer la
     * decisión se toma mirando el avatar — justo lo contrario de lo que
     * pretende esta sección, que empareja por gustos. Cuarenta
     * caracteres es poco para escribir y suficiente para que sea una
     * frase y no una palabra suelta.
     */
    if (bio.trim().length < 40) {
      return setError(
        "Escribe algo sobre ti, al menos una frase. Es lo único que las demás personas van a poder leer antes de decidir."
      );
    }
    if (!accepted) return setError("Tienes que aceptar las normas de convivencia para entrar.");

    setSaving(true);
    try {
      const supabase = createClient();
      const { error: dbError } = await supabase.from("social_profiles").upsert(
        {
          user_id: userId,
          alias: alias.trim(),
          birthdate,
          gender,
          looking_for: lookingFor,
          bio: bio.trim() || null,
          is_active: true,
          accepted_rules_at: new Date().toISOString(),
          accepted_rules_version: legalConfig.versionNormas,
        },
        { onConflict: "user_id" }
      );

      if (dbError) {
        playError();
        // 23505 = violación de índice único. Como cada persona solo puede
        // leer su propia fila, no se puede comprobar antes si el alias
        // está libre: se intenta guardar y es la base de datos la que lo
        // dice. Es además la única forma sin condiciones de carrera.
        const yaExiste = dbError.code === "23505" || /duplicate|unique/i.test(dbError.message ?? "");
        // La tabla puede no existir todavía si el SQL del apartado social
        // no se ha ejecutado en Supabase. Merece un mensaje propio porque
        // no se arregla cambiando nada del formulario.
        const faltaTabla =
          dbError.code === "42P01" ||
          dbError.code === "PGRST205" ||
          /does not exist|schema cache/i.test(dbError.message ?? "");
        setError(
          yaExiste
            ? "Ese alias ya está cogido. Prueba con otro."
            : faltaTabla
            ? "El apartado social todavía no está creado en la base de datos. Hay que ejecutar el SQL de supabase/schema.sql."
            : // Temporal, para poder ver el motivo real sin mirar los logs.
              // Quitar el detalle técnico cuando esto vaya fino.
              `No se ha podido guardar. (detalle técnico: ${dbError.code ?? "sin código"} — ${dbError.message ?? "sin mensaje"})`
        );
        setSaving(false);
        return;
      }

      playSuccess();
      setProfile({
        alias: alias.trim(),
        birthdate,
        gender,
        looking_for: lookingFor,
        bio: bio.trim() || null,
        is_active: true,
      });
    } catch {
      setError("No se ha podido conectar. Inténtalo en un momento.");
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = async () => {
    const supabase = createClient();
    await supabase.from("social_profiles").delete().eq("user_id", userId);
    setProfile(null);
    setConfirmingLeave(false);
    playError();
  };

  if (loading) {
    // Marcador de posición con la MISMA forma que el contenido real, no
    // un "Cargando…" suelto arriba del todo. Antes se veía una línea de
    // texto durante un segundo y luego el apartado aparecía de golpe,
    // sin transición: el salto entre las dos cosas era lo que quedaba
    // mal. Ocupando ya el sitio correcto, lo que llega después se lee
    // como que se ha rellenado, no como que ha cambiado de pantalla.
    return (
      <div className="mx-auto max-w-2xl animate-pulse px-4 py-10 sm:px-6">
        <div className="h-7 w-40 rounded bg-panel-border/50" />
        <div className="mt-3 h-4 w-full rounded bg-panel-border/30" />
        <div className="mt-2 h-4 w-2/3 rounded bg-panel-border/30" />
        <div className="panel mt-6 h-24 rounded-2xl border border-panel-border/50" />
        <div className="panel mt-6 h-72 rounded-2xl border border-panel-border/50" />
      </div>
    );
  }

  if (!userId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto max-w-2xl px-4 py-10 sm:px-6"
      >
        <h1 className="font-heading text-2xl font-bold">Conectar</h1>
        <p className="mt-2 text-sm text-muted">
          Conocer gente por lo que veis en común necesita cuenta: hace falta para saber tu edad y
          para que puedas bloquear y denunciar a alguien si hace falta.
        </p>
        <Link
          href="/login"
          className="accent-gradient mt-6 inline-block rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-105 active:scale-95"
        >
          Iniciar sesión / Crear cuenta
        </Link>
      </motion.div>
    );
  }

  // --- Declaró ser menor de edad -----------------------------------------
  // A propósito NO se vuelve a enseñar el formulario ni se repite cuál es
  // la edad que haría falta: sería explicarle qué fecha poner para entrar.
  if (bloqueadoPorEdad && !profile) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="font-heading text-2xl font-bold">Conectar</h1>
        <div className="panel mt-6 rounded-2xl border border-rumor/25 p-6">
          <p className="text-sm leading-relaxed text-foreground/90">
            Según la fecha que has indicado, este apartado no está disponible para ti.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            El resto de {siteConfig.name} sigue funcionando con normalidad: las noticias, tus
            gustos y {siteConfig.assistantName} están disponibles igual.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Si te has equivocado al escribir la fecha, escríbenos a{" "}
            <span className="text-foreground">{legalConfig.emailContacto}</span>.
          </p>
        </div>
        <Link
          href="/noticias"
          className="accent-gradient mt-6 inline-block rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-105 active:scale-95"
        >
          Volver a las noticias
        </Link>
      </div>
    );
  }

  // --- Ya tiene perfil ---------------------------------------------------
  if (profile) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className=""
      >
        {/*
          Tres asuntos distintos en tres pestañas, en vez de apilados en
          la misma página. Lo de "Tu perfil" se le pasa al contenedor como
          contenido de su pestaña: sigue viviendo aquí, que es donde está
          la lógica de borrarlo.
        */}
        <ConectarShell
          perfil={
            <>
              <PerfilSocialVista perfil={profile} onSalir={() => setConfirmingLeave(true)} />
        <ConfirmDialog
          open={confirmingLeave}
          title="¿Seguro que quieres salir?"
          message={`Se borrará tu perfil social: el alias «${profile.alias}», tu fecha de nacimiento, cómo te identificas y con quién querías coincidir. Dejarás de aparecer en el apartado Conectar.\n\nEl resto de tu cuenta no se toca: tus noticias, tus gustos y lo que ${siteConfig.assistantName} recuerda de ti siguen igual.\n\nPuedes volver a entrar cuando quieras, pero tendrás que rellenarlo todo otra vez y el alias podría estar cogido por otra persona.`}
          confirmLabel="Sí, borrar mi perfil social"
          onConfirm={handleLeave}
          onCancel={() => setConfirmingLeave(false)}
        />
            </>
          }
        />
      </motion.div>
    );
  }

  // --- Alta --------------------------------------------------------------
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto max-w-2xl px-4 py-10 sm:px-6"
    >
      <h1 className="font-heading text-2xl font-bold">Conectar</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Hablar con gente a la que le gusta lo mismo que a ti. Sin foto y sin nombre al principio: el
        perfil se va descubriendo mientras habláis.
      </p>

      <div className="panel mt-6 rounded-2xl border border-ice/20 p-5">
        <p className="text-sm leading-relaxed text-foreground/90">
          <strong>Este apartado es solo para mayores de {legalConfig.edadMinimaSocial} años.</strong>
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          El resto de la app se puede usar desde los {legalConfig.edadMinimaApp}. Aquí la edad es
          mayor porque no son noticias: es hablar en privado con personas desconocidas, y no queremos
          menores y adultos mezclados.
        </p>
      </div>

      <div className="panel mt-6 rounded-2xl p-6">
        <label className="block text-sm font-medium">Alias</label>
        <p className="mt-1 text-xs text-muted">Como quieres que te llamen. No uses tu nombre real.</p>
        <input
          type="text"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          maxLength={24}
          placeholder="Ej. shirokuma"
          className="mt-2 w-full rounded-xl border border-panel-border bg-panel-soft/50 px-3 py-2 text-sm outline-none focus:border-ice/50"
        />

        <label className="mt-6 block text-sm font-medium">Fecha de nacimiento</label>
        <p className="mt-1 text-xs text-muted">
          Solo se usa para calcular tu edad. No se enseña a nadie.
        </p>
        <div className="mt-2">
          <DateOfBirthPicker value={birthdate} onChange={setBirthdate} />
        </div>
        {age !== null && !isAdult && (
          <p className="mt-2 text-xs text-rumor">
            Con {age} años no puedes usar este apartado. El resto de la app sí.
          </p>
        )}

        <label className="mt-6 block text-sm font-medium">Cómo te identificas</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {GENDERS.map((g) => (
            <SelectableChip
              key={g}
              label={g}
              selected={gender === g}
              onClick={() => setGender(g)}
            />
          ))}
        </div>

        <label className="mt-6 block text-sm font-medium">Con quién quieres coincidir</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {LOOKING_FOR.map((l) => (
            <SelectableChip
              key={l}
              label={l}
              selected={lookingFor.includes(l)}
              onClick={() =>
                setLookingFor((prev) =>
                  prev.includes(l) ? prev.filter((v) => v !== l) : [...prev, l]
                )
              }
            />
          ))}
        </div>

        <label className="mt-6 block text-sm font-medium">Algo sobre ti</label>
        <p className="mt-1 text-xs leading-snug text-muted">
          Es lo único que las demás personas pueden leer de ti antes de decidir. Cuenta qué estás
          viendo ahora, qué serie no te cansas de recomendar o qué buscas aquí.
        </p>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={280}
          rows={4}
          placeholder="Ej.: Llevo el verano con Frieren y me ha destrozado. Me van las series lentas y los finales tristes. Busco gente con quien comentar capítulos según salen."
          className="mt-2 w-full resize-none rounded-xl border border-panel-border bg-panel-soft/50 px-3 py-2 text-sm outline-none focus:border-ice/50"
        />
        <p className="mt-1 text-right text-[11px] text-muted">
          {bio.trim().length < 40
            ? `Te faltan ${40 - bio.trim().length} caracteres`
            : `${bio.length}/280`}
        </p>

        <div className="mt-6">
          <CheckBox checked={accepted} onChange={setAccepted}>
            Declaro que tengo al menos {legalConfig.edadMinimaSocial} años y acepto las{" "}
            <Link href="/legal/normas" target="_blank" className="ice-text hover:underline">
              normas de convivencia
            </Link>
            , los{" "}
            <Link href="/legal/terminos" target="_blank" className="ice-text hover:underline">
              términos de uso
            </Link>{" "}
            y el tratamiento de estos datos según la{" "}
            <Link href="/legal/privacidad" target="_blank" className="ice-text hover:underline">
              política de privacidad
            </Link>
            .
          </CheckBox>
        </div>

        {error && <p className="mt-4 text-sm text-rumor">{error}</p>}

        <motion.button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          className="accent-gradient mt-6 w-full rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Crear mi perfil"}
        </motion.button>
      </div>
    </motion.div>
  );
}

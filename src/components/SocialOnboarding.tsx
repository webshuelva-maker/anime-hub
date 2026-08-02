"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { legalConfig } from "@/config/legal";
import { siteConfig } from "@/config/site";
import { SelectableChip } from "./SelectableChip";
import { ConfirmDialog } from "./ConfirmDialog";
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

export function SocialOnboarding() {
  const [loading, setLoading] = useState(true);
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
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      return setError(
        `Este apartado es solo para mayores de ${legalConfig.edadMinimaSocial} años. El resto de la app sigue disponible para ti.`
      );
    }
    if (age > 120) return setError("Esa fecha no parece correcta.");
    if (!gender) return setError("Elige una opción en «cómo te identificas».");
    if (lookingFor.length === 0) return setError("Elige con quién quieres coincidir.");
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
        setError("No se ha podido guardar. Revisa los datos e inténtalo de nuevo.");
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
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <p className="text-sm text-muted">Cargando…</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
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
      </div>
    );
  }

  // --- Ya tiene perfil ---------------------------------------------------
  if (profile) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="font-heading text-2xl font-bold">Conectar</h1>
        <p className="mt-1 text-sm text-muted">
          Tu perfil está listo, {profile.alias}. El emparejamiento todavía se está construyendo.
        </p>

        <div className="panel mt-6 rounded-2xl p-6">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted">
            Qué va a pasar
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-foreground/90">
            Cuando esté en marcha, {siteConfig.assistantName} te propondrá personas con gustos
            parecidos a los tuyos. Empezaréis hablando sin foto y sin nombre: el perfil se va
            descubriendo poco a poco según habléis, y solo si los dos queréis.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Podrás bloquear y denunciar desde el primer mensaje, siempre.
          </p>
        </div>

        <div className="panel mt-6 rounded-2xl p-6">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted">
            Tu perfil
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Alias</dt>
              <dd>{profile.alias}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Te identificas como</dt>
              <dd>{profile.gender}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Quieres coincidir con</dt>
              <dd className="text-right">{profile.looking_for.join(", ")}</dd>
            </div>
          </dl>
        </div>

        <button
          type="button"
          onClick={() => setConfirmingLeave(true)}
          className="mt-6 rounded-full border border-rumor/40 px-4 py-2 text-sm font-medium text-rumor transition-colors hover:bg-rumor/10"
        >
          Salir del apartado social y borrar este perfil
        </button>

        <ConfirmDialog
          open={confirmingLeave}
          title="Salir del apartado social"
          message="Se borrará tu perfil social (alias, fecha de nacimiento, cómo te identificas y con quién quieres coincidir). El resto de tu cuenta y tus gustos no se tocan. Puedes volver a entrar cuando quieras."
          confirmLabel="Sí, borrar mi perfil social"
          onConfirm={handleLeave}
          onCancel={() => setConfirmingLeave(false)}
        />
      </div>
    );
  }

  // --- Alta --------------------------------------------------------------
  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-2xl font-bold">Conectar</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Hablar con gente a la que le gusta lo mismo que a ti. Sin foto y sin nombre al principio: el
        perfil se va descubriendo mientras habláis.
      </p>

      <div className="panel mt-6 rounded-2xl border border-ice/20 p-5">
        <p className="text-sm leading-relaxed text-foreground/90">
          <strong>Solo para mayores de {legalConfig.edadMinimaSocial} años.</strong> El resto de la
          app no tiene esa restricción, pero para hablar con desconocidos sí.
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
        <input
          type="date"
          value={birthdate}
          onChange={(e) => setBirthdate(e.target.value)}
          className="mt-2 w-full rounded-xl border border-panel-border bg-panel-soft/50 px-3 py-2 text-sm outline-none focus:border-ice/50"
        />
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

        <label className="mt-6 block text-sm font-medium">Algo sobre ti (opcional)</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="Qué estás viendo ahora, qué te gusta…"
          className="mt-2 w-full resize-none rounded-xl border border-panel-border bg-panel-soft/50 px-3 py-2 text-sm outline-none focus:border-ice/50"
        />

        <label className="mt-6 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[var(--ice)]"
          />
          <span className="text-xs leading-relaxed text-muted">
            Declaro que tengo al menos {legalConfig.edadMinimaSocial} años y acepto las{" "}
            <Link href="/legal/normas" className="ice-text hover:underline">
              normas de convivencia
            </Link>
            , los{" "}
            <Link href="/legal/terminos" className="ice-text hover:underline">
              términos de uso
            </Link>{" "}
            y el tratamiento de estos datos según la{" "}
            <Link href="/legal/privacidad" className="ice-text hover:underline">
              política de privacidad
            </Link>
            .
          </span>
        </label>

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
    </div>
  );
}

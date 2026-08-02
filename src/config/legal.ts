/**
 * Datos del responsable y versiones de los documentos legales.
 *
 * Este proyecto es GRATUITO y sin ánimo de lucro: no cobra, no vende y no
 * lleva publicidad. Eso cambia bastante lo que hace falta:
 *
 * - Las obligaciones de la LSSI (publicar NIF y domicilio) están pensadas
 *   para quien presta un servicio con actividad económica. Sin cobrar ni
 *   monetizar, no aplican de la misma forma, así que NIF y domicilio
 *   quedan opcionales: si los dejas vacíos, no se muestran.
 * - Lo que sí aplica igual, cobres o no, es el RGPD: hace falta poder
 *   identificar a quien decide qué se hace con los datos y una forma
 *   real de contactar. Por eso el nombre y el correo NO son opcionales.
 *
 * Si algún día cobras o metes publicidad, hay que rellenar NIF y
 * domicilio y revisar los textos.
 *
 * Al cambiar cualquiera de los documentos, sube su versión: las
 * aceptaciones se guardan con la versión aceptada, y eso es lo que sirve
 * de prueba de qué aceptó cada persona y cuándo.
 */
export const legalConfig = {
  // Obligatorios
  responsable: "PENDIENTE — tu nombre y apellidos",
  emailContacto: "PENDIENTE — correo de contacto",

  // Opcionales mientras el proyecto sea gratuito (déjalos vacíos y no se enseñan)
  nif: "",
  domicilio: "",
  emailPrivacidad: "", // si lo dejas vacío se usa el de contacto
  emailModeracion: "", // si lo dejas vacío se usa el de contacto

  /** Proyecto gratuito, sin publicidad y sin fines comerciales. */
  sinAnimoDeLucro: true,

  versionTerminos: "1.0",
  versionPrivacidad: "1.0",
  versionNormas: "1.0",
  ultimaActualizacion: "2026-08-02",

  edadMinimaApp: 14, // edad de consentimiento digital propio en España (LOPDGDD art. 7)
  edadMinimaSocial: 18, // el apartado social es solo para adultos

  /** Cómo se presenta quien atiende los tickets de soporte. */
  soporteNombre: "Víctor",
  soporteRango: "Administrador",
} as const;

/** Correo para ejercer derechos; cae al de contacto si no se ha puesto otro. */
export const emailPrivacidad = legalConfig.emailPrivacidad || legalConfig.emailContacto;

/** Correo para denuncias; cae al de contacto si no se ha puesto otro. */
export const emailModeracion = legalConfig.emailModeracion || legalConfig.emailContacto;

/** Identificación del responsable, sin enseñar los campos que estén vacíos. */
export function identificacionResponsable(): string {
  const partes = [legalConfig.responsable];
  if (legalConfig.nif) partes.push(`NIF ${legalConfig.nif}`);
  if (legalConfig.domicilio) partes.push(`domicilio en ${legalConfig.domicilio}`);
  return partes.join(", ");
}

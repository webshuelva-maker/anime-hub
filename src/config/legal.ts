/**
 * Datos del responsable y versiones de los documentos legales.
 *
 * IMPORTANTE: los campos marcados como PENDIENTE hay que rellenarlos con
 * datos reales antes de abrir la app al público. Una política de
 * privacidad sin responsable identificable no cumple el artículo 13 del
 * RGPD, y en España la LSSI obliga además a publicar nombre, NIF,
 * domicilio y contacto de quien presta el servicio.
 *
 * Al cambiar cualquiera de los textos legales, sube su versión: las
 * aceptaciones se guardan con la versión aceptada, y eso es lo que sirve
 * de prueba de qué aceptó cada persona y cuándo.
 */
export const legalConfig = {
  responsable: "PENDIENTE — nombre y apellidos o razón social",
  nif: "PENDIENTE — NIF / CIF",
  domicilio: "PENDIENTE — domicilio a efectos de notificaciones",
  emailContacto: "PENDIENTE — correo de contacto",
  emailPrivacidad: "PENDIENTE — correo para ejercer derechos (puede ser el mismo)",
  emailModeracion: "PENDIENTE — correo para denuncias y moderación",

  versionTerminos: "1.0",
  versionPrivacidad: "1.0",
  versionNormas: "1.0",
  ultimaActualizacion: "2026-08-02",

  edadMinimaApp: 14, // edad de consentimiento digital propio en España (LOPDGDD art. 7)
  edadMinimaSocial: 18, // el apartado social es solo para adultos
} as const;

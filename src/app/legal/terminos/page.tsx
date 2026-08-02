import { LegalPage } from "@/components/LegalPage";
import { legalConfig } from "@/config/legal";
import { siteConfig } from "@/config/site";

export const metadata = { title: "Términos de uso" };

export default function TerminosPage() {
  return (
    <main className="flex-1 bg-background">
      <LegalPage title="Términos de uso" version={legalConfig.versionTerminos}>
        <h2>1. Quién presta este servicio</h2>
        <p>
          {siteConfig.name} (en adelante, «la aplicación») es un servicio prestado por{" "}
          <strong>{legalConfig.responsable}</strong>, con NIF {legalConfig.nif} y domicilio en{" "}
          {legalConfig.domicilio}. Puedes contactar en {legalConfig.emailContacto}.
        </p>

        <h2>2. Qué es la aplicación</h2>
        <p>
          La aplicación agrega y traduce noticias sobre anime y manga publicadas por terceros,
          ofrece un asistente conversacional ({siteConfig.assistantName}) y, en su apartado social,
          permite ponerse en contacto con otras personas usuarias. Al usarla aceptas estos términos.
        </p>

        <h2>3. Edad mínima</h2>
        <p>
          Para usar la aplicación necesitas tener al menos {legalConfig.edadMinimaApp} años. El
          apartado social es exclusivamente para <strong>mayores de {legalConfig.edadMinimaSocial}{" "}
          años</strong>: al activarlo declaras ser mayor de edad, y esa declaración queda registrada.
          Si detectamos o se nos comunica que una cuenta incumple estos límites, se suspenderá.
        </p>

        <h2>4. Tu cuenta</h2>
        <ul>
          <li>Los datos que facilites deben ser veraces y estar actualizados.</li>
          <li>Eres responsable de la custodia de tus credenciales y de la actividad de tu cuenta.</li>
          <li>No puedes suplantar a otra persona ni ceder tu cuenta a terceros.</li>
          <li>Puedes eliminar tu cuenta y tus datos en cualquier momento desde Ajustes.</li>
        </ul>

        <h2>5. Contenidos de terceros</h2>
        <p>
          Las noticias se obtienen de fuentes públicas de terceros (medios, bases de datos y
          buscadores). La aplicación muestra titulares, resúmenes, traducciones automáticas y{" "}
          <strong>siempre un enlace a la fuente original</strong>, cuya autoría y responsabilidad
          corresponde a quien la publica. No garantizamos la exactitud, vigencia ni disponibilidad de
          esos contenidos. Si eres titular de derechos y consideras que un contenido no debería
          mostrarse, escríbenos a {legalConfig.emailContacto} y lo retiraremos sin demora.
        </p>

        <h2>6. El asistente y la información que da</h2>
        <p>
          {siteConfig.assistantName} genera sus respuestas de forma automática a partir de fuentes de
          internet y bases de datos públicas. <strong>Puede equivocarse.</strong> La información que
          ofrece es orientativa y no debe tomarse como confirmación oficial de nada, ni como
          asesoramiento de ningún tipo. Verifica siempre en la fuente original antes de tomar
          cualquier decisión basada en ella.
        </p>

        <h2>7. Contenidos que publicas y conducta</h2>
        <p>
          Eres el único responsable de lo que escribes, envías o compartes en la aplicación,
          incluidas las conversaciones del apartado social. Al publicar contenido declaras tener
          derecho a hacerlo. Queda prohibido, y podrá suponer la suspensión inmediata de la cuenta:
        </p>
        <ul>
          <li>Contenido sexual explícito, y en particular cualquier contenido que involucre a menores.</li>
          <li>Acoso, amenazas, incitación al odio o discriminación por cualquier motivo.</li>
          <li>Suplantación de identidad y falsedad sobre la edad.</li>
          <li>Actividades ilícitas, fraude, estafas, venta de productos prohibidos o spam.</li>
          <li>Difusión de datos personales de terceros sin su consentimiento.</li>
          <li>Vulneración de derechos de propiedad intelectual o industrial.</li>
          <li>Uso automatizado, extracción masiva de datos o intentos de vulnerar la seguridad.</li>
        </ul>
        <p>
          Nos reservamos el derecho a retirar contenidos y a suspender o cancelar cuentas que
          incumplan estos términos o las normas de convivencia, con o sin aviso previo según la
          gravedad.
        </p>

        <h2>8. Moderación y denuncias</h2>
        <p>
          Puedes denunciar a cualquier persona usuaria y bloquearla desde la propia conversación. Las
          denuncias se revisan y pueden derivar en advertencia, suspensión o expulsión. Las
          conductas que puedan ser constitutivas de delito se pondrán en conocimiento de las
          autoridades competentes. Para asuntos urgentes: {legalConfig.emailModeracion}.
        </p>

        <h2>9. Servicio «tal cual» y responsabilidad</h2>
        <p>
          La aplicación se presta «tal cual» y «según disponibilidad». En la medida permitida por la
          ley, no respondemos de: interrupciones, pérdida de datos, errores en la información
          mostrada o generada automáticamente, ni de los daños derivados de la conducta de otras
          personas usuarias o del contenido de sitios de terceros enlazados.
        </p>
        <p>
          Nada en estos términos excluye la responsabilidad que legalmente no pueda excluirse,
          incluida la derivada de dolo o negligencia grave, ni los derechos que la normativa de
          consumo reconoce a las personas consumidoras.
        </p>

        <h2>10. Relación entre personas usuarias</h2>
        <p>
          El apartado social se limita a facilitar el contacto. No verificamos la identidad de las
          personas usuarias más allá de lo indicado, no intervenimos en vuestras conversaciones y{" "}
          <strong>no somos parte de la relación que establezcáis entre vosotras</strong>. Actúa con
          la misma prudencia que con cualquier persona desconocida: no compartas datos sensibles,
          bancarios ni de localización.
        </p>

        <h2>11. Suscripción de pago</h2>
        <p>
          Si en el futuro se ofrecen funciones de pago, el precio, la duración, la renovación y el
          derecho de desistimiento se informarán antes de la contratación, conforme a la normativa de
          consumo aplicable.
        </p>

        <h2>12. Cambios</h2>
        <p>
          Podemos modificar estos términos. Los cambios relevantes se avisarán dentro de la
          aplicación con antelación razonable. Seguir usándola después de la entrada en vigor implica
          su aceptación.
        </p>

        <h2>13. Ley aplicable</h2>
        <p>
          Estos términos se rigen por la legislación española. Si eres persona consumidora, podrás
          acudir a los juzgados de tu domicilio y a los sistemas de resolución alternativa de
          litigios, incluida la plataforma europea de resolución de litigios en línea.
        </p>
      </LegalPage>
    </main>
  );
}

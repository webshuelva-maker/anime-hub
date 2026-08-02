import { LegalPage } from "@/components/LegalPage";
import { legalConfig } from "@/config/legal";
import { siteConfig } from "@/config/site";

export const metadata = { title: "Política de privacidad" };

export default function PrivacidadPage() {
  return (
    <main className="flex-1 bg-background">
      <LegalPage title="Política de privacidad" version={legalConfig.versionPrivacidad}>
        <h2>1. Responsable del tratamiento</h2>
        <p>
          <strong>{legalConfig.responsable}</strong>, NIF {legalConfig.nif}, domicilio en{" "}
          {legalConfig.domicilio}. Correo para asuntos de protección de datos:{" "}
          {legalConfig.emailPrivacidad}.
        </p>

        <h2>2. Qué datos tratamos y para qué</h2>

        <h3>Uso básico de la aplicación</h3>
        <p>
          Si no creas cuenta, tus preferencias y lo que la app aprende de ti se guardan{" "}
          <strong>solo en tu navegador</strong> y no llegan a nuestros servidores.
        </p>

        <h3>Cuenta</h3>
        <ul>
          <li>
            <strong>Datos:</strong> correo electrónico, nombre que elijas mostrar y, si la subes,
            imagen de perfil.
          </li>
          <li>
            <strong>Finalidad:</strong> crear y mantener tu cuenta y sincronizar tus preferencias
            entre dispositivos.
          </li>
          <li>
            <strong>Base jurídica:</strong> ejecución del contrato (art. 6.1.b RGPD).
          </li>
        </ul>

        <h3>Gustos aprendidos y memoria del asistente</h3>
        <ul>
          <li>
            <strong>Datos:</strong> géneros, estudios y series con los que interactúas, noticias que
            marcas, y los datos que {siteConfig.assistantName} guarda de vuestras conversaciones.
          </li>
          <li>
            <strong>Finalidad:</strong> personalizar tu feed y que el asistente te conozca entre
            dispositivos.
          </li>
          <li>
            <strong>Base jurídica:</strong> ejecución del contrato. Puedes ver y borrar esta
            información, entera o pieza a pieza, desde la propia aplicación.
          </li>
        </ul>

        <h3>Conversaciones con el asistente</h3>
        <ul>
          <li>
            <strong>Datos:</strong> los mensajes que le escribes.
          </li>
          <li>
            <strong>Finalidad:</strong> generar la respuesta. Se envían al proveedor de inteligencia
            artificial indicado más abajo.
          </li>
          <li>
            <strong>Consejo:</strong> no le cuentes datos sensibles (salud, ideología, situación
            económica) ni datos de terceros.
          </li>
        </ul>

        <h3>Apartado social (solo si lo activas)</h3>
        <ul>
          <li>
            <strong>Datos:</strong> fecha de nacimiento, sexo o identidad que declares, con quién
            quieres coincidir, alias, descripción y los mensajes que intercambies.
          </li>
          <li>
            <strong>Finalidad:</strong> proponerte personas compatibles, impedir que se pongan en
            contacto personas menores y adultas, y moderar la convivencia.
          </li>
          <li>
            <strong>Base jurídica:</strong> tu consentimiento expreso al activarlo (art. 6.1.a RGPD),
            que puedes retirar en cualquier momento desactivando el apartado, y el interés legítimo
            en garantizar la seguridad de las personas usuarias.
          </li>
          <li>
            <strong>Importante:</strong> este apartado es solo para mayores de{" "}
            {legalConfig.edadMinimaSocial} años.
          </li>
        </ul>

        <h3>Denuncias y moderación</h3>
        <p>
          Cuando denuncias a alguien tratamos tu identificador, el de la persona denunciada, el
          motivo y el contenido reportado, con la finalidad de investigar y adoptar medidas. Base
          jurídica: interés legítimo en mantener un entorno seguro y cumplimiento de obligaciones
          legales.
        </p>

        <h2>3. Menores de edad</h2>
        <p>
          La aplicación no está dirigida a menores de {legalConfig.edadMinimaApp} años. Conforme al
          artículo 7 de la LOPDGDD, por debajo de esa edad hace falta el consentimiento de quien
          ostente la patria potestad o tutela. El apartado social está reservado a mayores de{" "}
          {legalConfig.edadMinimaSocial}. Si tienes conocimiento de una cuenta que incumpla esto,
          avísanos en {legalConfig.emailModeracion} y actuaremos de inmediato.
        </p>

        <h2>4. Quién más trata tus datos</h2>
        <ul>
          <li>
            <strong>Supabase</strong> — autenticación y base de datos.
          </li>
          <li>
            <strong>Groq</strong> — generación de las respuestas del asistente y traducción de
            titulares.
          </li>
          <li>
            <strong>Proveedor de alojamiento</strong> de la aplicación.
          </li>
        </ul>
        <p>
          Algunos de estos proveedores están fuera del Espacio Económico Europeo. En esos casos, las
          transferencias se amparan en las cláusulas contractuales tipo de la Comisión Europea o en
          una decisión de adecuación, según el proveedor. No vendemos tus datos ni los cedemos con
          fines publicitarios.
        </p>

        <h2>5. Cuánto tiempo los conservamos</h2>
        <ul>
          <li>Datos de cuenta: mientras la mantengas abierta.</li>
          <li>Gustos aprendidos y memoria del asistente: hasta que los borres o cierres la cuenta.</li>
          <li>Perfil social: hasta que lo desactives o cierres la cuenta.</li>
          <li>
            Denuncias y registros de moderación: hasta 12 meses tras su resolución, o más si fuera
            necesario para atender responsabilidades legales.
          </li>
        </ul>

        <h2>6. Tus derechos</h2>
        <p>
          Puedes ejercer los derechos de acceso, rectificación, supresión, limitación, oposición y
          portabilidad, así como retirar tu consentimiento, escribiendo a{" "}
          {legalConfig.emailPrivacidad}. Buena parte puedes ejercerlos tú mismo desde la aplicación
          (ver y borrar lo aprendido, borrar la memoria del asistente, eliminar la cuenta).
        </p>
        <p>
          Si consideras que no hemos atendido correctamente tu solicitud, puedes reclamar ante la
          Agencia Española de Protección de Datos (www.aepd.es).
        </p>

        <h2>7. Seguridad</h2>
        <p>
          Aplicamos medidas técnicas y organizativas razonables, entre ellas el aislamiento por
          usuario en la base de datos, de forma que cada cuenta solo puede acceder a sus propios
          datos. Ningún sistema es infalible: si se produjera una brecha que suponga un riesgo alto
          para tus derechos, te lo comunicaremos.
        </p>

        <h2>8. Cambios</h2>
        <p>
          Si modificamos esta política, publicaremos la nueva versión aquí y avisaremos dentro de la
          aplicación cuando el cambio sea relevante.
        </p>
      </LegalPage>
    </main>
  );
}

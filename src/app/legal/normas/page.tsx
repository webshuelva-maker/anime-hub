import { LegalPage } from "@/components/LegalPage";
import { legalConfig, emailModeracion } from "@/config/legal";

export const metadata = { title: "Normas de convivencia" };

export default function NormasPage() {
  return (
    <main className="flex-1 bg-background">
      <LegalPage title="Normas de convivencia" version={legalConfig.versionNormas}>
        <p>
          Estas normas se aplican a todo lo que escribas en la aplicación, y muy especialmente al
          apartado social. Son cortas a propósito: si dudas de si algo encaja aquí, probablemente no
          encaje.
        </p>

        <h2>Lo que no se tolera, sin segundas oportunidades</h2>
        <ul>
          <li>
            <strong>Cualquier contenido sexual que involucre a menores</strong>, real o dibujado,
            explícito o insinuado. Expulsión inmediata y comunicación a las autoridades.
          </li>
          <li>
            <strong>Mentir sobre tu edad</strong> para entrar en el apartado social, o intentar
            contactar con menores.
          </li>
          <li>Amenazas, acoso, chantaje o difusión de imágenes íntimas de otra persona.</li>
          <li>Incitación al odio o a la violencia contra un colectivo o una persona.</li>
        </ul>

        <h2>Lo que supone advertencia o suspensión</h2>
        <ul>
          <li>Insistir en hablar de sexo con quien no quiere.</li>
          <li>Pedir dinero, vender cosas, promocionar servicios o hacer spam.</li>
          <li>Publicar datos personales de otra persona sin su permiso.</li>
          <li>Suplantar a alguien o usar fotos que no son tuyas.</li>
          <li>Compartir enlaces de descarga ilegal.</li>
        </ul>

        <h2>Lo que sí es normal</h2>
        <p>
          Discutir, discrepar, decir que una serie es mala, soltar un taco. Esto no es un club de
          etiqueta: lo que se persigue es el daño a otras personas, no el mal humor.
        </p>

        <h2>Consejos de seguridad</h2>
        <ul>
          <li>No compartas tu dirección, tu centro de estudios o de trabajo, ni tu rutina diaria.</li>
          <li>Nunca envíes dinero ni datos bancarios a alguien que hayas conocido aquí.</li>
          <li>
            Desconfía de quien tiene mucha prisa por pasarse a otra aplicación, por verte o por
            conseguir fotos tuyas.
          </li>
          <li>Si quedas con alguien, que sea en un sitio público y díselo a una persona de confianza.</li>
        </ul>

        <h2>Bloquear y denunciar</h2>
        <p>
          Puedes bloquear a cualquier persona en cualquier momento: dejaréis de cruzaros y no podrá
          escribirte. Denunciar es distinto de bloquear: la denuncia la revisamos nosotros. Úsala sin
          reparo, no hace falta estar seguro de nada. Para casos graves o urgentes:{" "}
          {emailModeracion}.
        </p>
        <p>
          Si crees que puede haber un delito en curso o hay un menor en peligro, no te quedes solo
          con la denuncia dentro de la app: en España puedes llamar al 091 o al 112.
        </p>
      </LegalPage>
    </main>
  );
}

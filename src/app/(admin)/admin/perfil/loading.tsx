import { Skeleton } from "@/ui/patterns";
import {
  CabecalhoCarregando,
  CamposCarregando,
  CartaoCarregando,
  TelaCarregando,
} from "../_ui/Esqueletos";

/** Skeleton de Meu perfil: dados pessoais e papéis de acesso. */
export default function Loading() {
  return (
    <TelaCarregando nome="o perfil" className="flex flex-col gap-4">
      <CabecalhoCarregando
        titulo="Meu perfil"
        como="h2"
        classeTitulo="text-[22px] font-extrabold"
      />
      <CartaoCarregando descricao className="max-w-[620px]">
        <CamposCarregando quantidade={1} />
      </CartaoCarregando>
      <CartaoCarregando descricao className="max-w-[620px]">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-28 rounded-pill" delay={0.04} />
          <Skeleton className="h-7 w-24 rounded-pill" delay={0.08} />
        </div>
      </CartaoCarregando>
    </TelaCarregando>
  );
}

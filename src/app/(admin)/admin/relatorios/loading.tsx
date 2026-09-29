import {
  CabecalhoCarregando,
  CartaoCarregando,
  PilulasCarregando,
  TabelaCarregando,
  TelaCarregando,
} from "../_ui/Esqueletos";

/** Skeleton de Relatórios: período, catálogo de relatórios e a tabela. */
export default function Loading() {
  return (
    <TelaCarregando nome="os relatórios">
      <CabecalhoCarregando
        titulo="Relatórios"
        acoes={<PilulasCarregando quantidade={5} forma="chip" className="flex flex-wrap gap-2" />}
      />
      <CartaoCarregando titulo={false}>
        <PilulasCarregando quantidade={6} forma="chip" className="flex flex-wrap gap-2" />
      </CartaoCarregando>
      <CartaoCarregando descricao>
        <TabelaCarregando linhas={6} colunas={4} moldura={false} />
      </CartaoCarregando>
    </TelaCarregando>
  );
}

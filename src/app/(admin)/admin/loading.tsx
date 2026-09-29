import {
  BlocosCarregando,
  CabecalhoCarregando,
  CartaoCarregando,
  PilulasCarregando,
  TelaCarregando,
} from "./_ui/Esqueletos";
import {
  MovimentoCarregando,
  RankingCarregando,
  ResumoCarregando,
} from "./_ui/EsqueletosDoDashboard";

/**
 * Skeleton do Dashboard.
 *
 * Por estar na pasta `admin/`, este arquivo é também o limite de carregamento
 * de todas as seções. Na prática, só aparece para o Dashboard: cada seção tem
 * o seu `loading.tsx`, e o Next pré-carrega a rota até ele. Medido em produção
 * com a mesma estrutura de rotas (slot `@modal`, interceptação, layout com
 * `cookies()`): a troca de seção mostra direto o skeleton da seção, sem passar
 * por este, e ele não vaza para dentro do slot do modal. Ver D-2026-09-29-87.
 *
 * Fica na tela só até a Central de Atenção chegar. Os blocos de relatório
 * seguem com os MESMOS skeletons dentro da página (D-2026-09-29-90).
 */
export default function Loading() {
  return (
    <TelaCarregando nome="o painel">
      <CabecalhoCarregando
        titulo="Dashboard"
        acoes={<PilulasCarregando quantidade={5} forma="chip" className="flex flex-wrap gap-2" />}
      />

      <CartaoCarregando descricao>
        <BlocosCarregando quantidade={3} />
      </CartaoCarregando>

      <ResumoCarregando />
      <RankingCarregando />
      <MovimentoCarregando />
    </TelaCarregando>
  );
}

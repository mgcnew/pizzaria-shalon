import {
  CHAMADA_DO_CONVITE,
  ENDERECO_DO_APP,
  INSTRUCAO_DO_CONVITE,
  URL_DO_CONVITE,
  caminhoDoQr,
} from "./convite";

/**
 * Chamada + QR code para o cardápio, no fim da PRÉVIA do cupom do cliente
 * (PDV e segunda via). Herda a fonte e a cor do cupom. O endereço por
 * extenso fica embaixo para quem não consegue ler o QR.
 *
 * Só prévia: o papel sai da versão em linhas (`montarCupomDeVenda`), com o
 * QR no tamanho certo para a térmica. Aqui ele é menor, para a prévia não
 * empurrar os botões para fora do modal.
 */
export function ConviteDoApp() {
  const { tamanho, d } = caminhoDoQr(URL_DO_CONVITE);
  const lado = "30mm";
  return (
    <div className="mt-3 flex flex-col items-center border-t border-dashed border-black pt-2 text-center">
      <p className="m-0 text-[14px] font-bold">{CHAMADA_DO_CONVITE}</p>
      <svg
        role="img"
        aria-label={`QR code para ${ENDERECO_DO_APP}`}
        viewBox={`0 0 ${tamanho} ${tamanho}`}
        shapeRendering="crispEdges"
        className="my-1 max-w-full"
        style={{ width: lado, height: lado }}
      >
        <rect width={tamanho} height={tamanho} fill="#fff" />
        <path d={d} fill="#000" />
      </svg>
      <p className="m-0">{INSTRUCAO_DO_CONVITE}</p>
      <p className="m-0 font-bold">{ENDERECO_DO_APP}</p>
    </div>
  );
}

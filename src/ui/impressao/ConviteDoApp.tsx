import {
  CHAMADA_DO_CONVITE,
  ENDERECO_DO_APP,
  INSTRUCAO_DO_CONVITE,
  URL_DO_CONVITE,
  caminhoDoQr,
} from "./convite";

/**
 * Chamada + QR code para o cardápio, no fim do cupom do cliente (PDV e
 * segunda via). Herda a fonte e a cor do cupom. O endereço por extenso
 * fica embaixo para quem não consegue ler o QR.
 */
export function ConviteDoApp() {
  const { tamanho, d } = caminhoDoQr(URL_DO_CONVITE);
  return (
    <div className="mt-3 flex flex-col items-center border-t border-dashed border-black pt-2 text-center">
      <p className="m-0 text-[12px] font-bold">{CHAMADA_DO_CONVITE}</p>
      <svg
        role="img"
        aria-label={`QR code para ${ENDERECO_DO_APP}`}
        viewBox={`0 0 ${tamanho} ${tamanho}`}
        shapeRendering="crispEdges"
        className="my-1 h-[28mm] w-[28mm]"
      >
        <rect width={tamanho} height={tamanho} fill="#fff" />
        <path d={d} fill="#000" />
      </svg>
      <p className="m-0">{INSTRUCAO_DO_CONVITE}</p>
      <p className="m-0 font-bold">{ENDERECO_DO_APP}</p>
    </div>
  );
}

import qrcode from "qrcode-generator";

/**
 * Convite para o app no cupom do cliente: chamada + QR code para o cardápio.
 *
 * Só no cupom do PDV e na segunda via, que vão para a mão do cliente. A
 * comanda é da cozinha e não leva convite.
 *
 * ENDEREÇO TEMPORÁRIO, decidido pela dona em 08/10/2026: enquanto não há
 * domínio próprio, o QR aponta para o endereço da Vercel. Trocar aqui, e só
 * aqui, quando o domínio existir.
 *
 * `origem=cupom` marca de onde veio a visita. O cardápio ignora parâmetros
 * que não conhece; a marca existe para os relatórios poderem contar depois.
 */
export const ENDERECO_DO_APP = "pizzariashalon.vercel.app";
export const URL_DO_CONVITE = `https://${ENDERECO_DO_APP}/?origem=cupom`;

export const CHAMADA_DO_CONVITE = "Peça pelo nosso app!";
export const INSTRUCAO_DO_CONVITE = "Aponte a câmera do celular";

/** O convite como os cupons em texto (Bluetooth) o recebem. */
export const CONVITE = {
  url: URL_DO_CONVITE,
  endereco: ENDERECO_DO_APP,
  chamada: CHAMADA_DO_CONVITE,
  instrucao: INSTRUCAO_DO_CONVITE,
};

/**
 * Tamanho de cada módulo no papel: 1,25 mm = 10 pontos exatos da térmica
 * (203 dpi = 8 pontos/mm).
 *
 * Na primeira versão o QR tinha 28 mm, e o módulo dava 0,68 mm = 5,5 pontos:
 * a impressora arredondava uns para 5 e outros para 6, e o celular não lia
 * (08/10/2026). Módulo em número inteiro de pontos sai todo igual.
 */
export const MODULO_MM = 1.25;

/**
 * O QR como um único caminho SVG: um quadrado por módulo escuro, numa grade
 * de `tamanho` × `tamanho` (já com a margem branca de 4 módulos que os
 * leitores exigem). Um caminho só sai nítido na térmica, sem frestas entre
 * quadrados vizinhos.
 */
export function caminhoDoQr(texto: string): { tamanho: number; d: string } {
  // Correção "L": a térmica imprime nítido, e cada nível a mais engorda o
  // código — com "M" o endereço pedia 33 módulos; com "L", 29, e cada
  // módulo fica maior no mesmo papel.
  const qr = qrcode(0, "L");
  qr.addData(texto);
  qr.make();

  const modulos = qr.getModuleCount();
  const margem = 4;
  const partes: string[] = [];
  for (let linha = 0; linha < modulos; linha++) {
    for (let coluna = 0; coluna < modulos; coluna++) {
      if (qr.isDark(linha, coluna)) partes.push(`M${coluna + margem} ${linha + margem}h1v1h-1z`);
    }
  }
  return { tamanho: modulos + margem * 2, d: partes.join("") };
}

/** Largura do QR no papel, com a margem branca. */
export function larguraDoQrMm(tamanho: number): number {
  return tamanho * MODULO_MM;
}

/** O mesmo QR como texto SVG, para documentos montados como string. */
export function svgDoQr(texto: string): string {
  const { tamanho, d } = caminhoDoQr(texto);
  const larguraMm = larguraDoQrMm(tamanho);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tamanho} ${tamanho}" ` +
    `width="${larguraMm}mm" height="${larguraMm}mm" shape-rendering="crispEdges">` +
    `<rect width="${tamanho}" height="${tamanho}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
  );
}

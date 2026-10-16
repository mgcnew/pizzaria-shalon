import Image from "next/image";
import { formatBRL } from "@/lib/format";
import { StatusBadge, Input } from "@/ui/components";
import { Cartao, EmptyState, LinhaLista } from "@/ui/patterns";
import {
  listarBanners,
  listarCategorias,
  listarImagens,
  listarProdutos,
  listarPromocoes,
} from "@/application/catalogo/consultas";
import { salvarBanner, alternarAtivoBanner, removerBanner } from "@/application/catalogo/acoes";
import { enviarImagem, urlPublica } from "@/application/midia/imagem";
import { urlDaImagem } from "@/application/publico/consultas";
import { FormularioAcao } from "./FormularioAcao";
import { BotaoAcao } from "./BotaoAcao";
import { NovoItem } from "./NovoItem";
import { DestinoDoBanner } from "./DestinoDoBanner";
import { SeletorDeImagem, type OpcaoDeImagem } from "./SeletorDeImagem";
import { QuandoValeAPromocao } from "./QuandoValeAPromocao";

/**
 * Banners.
 *
 * O design aprovado NÃO possui tela de banner — o protótipo mostra o
 * carrossel no cardápio público, mas não a administração dele. Esta tela foi
 * montada usando exclusivamente o design system aprovado (cartão, lista,
 * pílula de status, par CTA), sem inventar linguagem visual nova. Registrada
 * como adaptação em A-06.
 *
 * RN-BANNER-002: destino interno REFERENCIA entidade. Não existe campo para
 * digitar link interno à mão — só produto, categoria, promoção, link externo
 * ou nenhum destino.
 *
 * RN-BANNER-003/004: "Aparece agora" é derivado — período do banner E
 * validade/disponibilidade do destino. Não é um interruptor.
 */
const DIA_CURTO: Record<number, string> = {
  1: "seg", 2: "ter", 3: "qua", 4: "qui", 5: "sex", 6: "sáb", 7: "dom",
};

export async function PainelBanners({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [banners, imagens, produtos, categorias, promocoes] = await Promise.all([
    listarBanners(),
    listarImagens("banner"),
    listarProdutos(),
    listarCategorias(),
    listarPromocoes(),
  ]);

  // Banner é peça larga (2:1); o popup é em retrato (1:2). Cada seletor mostra
  // só o que serve, para não pôr uma arte vertical no carrossel.
  const imagensLargas = imagens.filter((i) => (i.width ?? 1) >= (i.height ?? 0));
  const imagensRetrato = imagens.filter((i) => (i.height ?? 0) > (i.width ?? 1));

  // Prévia: cada imagem vira miniatura clicável, com a escolhida em tamanho
  // de uso. A URL do bucket é pública e determinística.
  const comUrl = async (lista: typeof imagens): Promise<OpcaoDeImagem[]> =>
    Promise.all(
      lista.map(async (i) => ({
        id: i.id,
        url: await urlPublica(i.storage_path),
        nome: i.original_filename ?? i.storage_path,
        dimensoes: `${i.width}×${i.height}`,
      })),
    );
  const opcoesLargas = await comUrl(imagensLargas);
  const opcoesRetrato = await comUrl(imagensRetrato);

  // Foto dos produtos do destaque (prévia no seletor).
  const caminhosDeFoto = [
    ...new Set(
      produtos.filter((p) => p.ativo).map((p) => p.imagem_path).filter((c): c is string => c !== null),
    ),
  ];
  const fotosDosProdutos = new Map(
    await Promise.all(caminhosDeFoto.map(async (c) => [c, await urlDaImagem(c)] as const)),
  );

  // Uma entrada por promoção (campanha), não por item.
  const porCampanha = new Map<string, { nome: string; idRepresentante: string; itens: number }>();
  for (const pr of promocoes) {
    const atual = porCampanha.get(pr.campanha_id);
    if (atual) atual.itens += 1;
    else porCampanha.set(pr.campanha_id, { nome: pr.nome, idRepresentante: pr.id, itens: 1 });
  }
  const campanhasParaBanner = [...porCampanha.values()];

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[70ch] text-[13.5px] text-ink-2">
        Banner com destino em promoção some quando a promoção não está valendo; banner de produto
        indisponível se oculta e reaparece quando o produto volta. Por isso a coluna &ldquo;aparece
        agora&rdquo; pode divergir de &ldquo;ativo&rdquo;.
      </p>

      {banners.length === 0 ? (
        <EmptyState
          titulo="Nenhum banner cadastrado"
          descricao="Envie uma imagem e escolha o destino: produto, categoria, promoção, link externo ou nenhum."
        />
      ) : (
        <Cartao largura="cheio">
          {await Promise.all(
            banners.map(async (b) => (
              <LinhaLista key={b.id}>
                <Image
                  src={await urlPublica(b.imagem_path)}
                  alt={b.titulo ?? "Banner do cardápio"}
                  width={96}
                  height={48}
                  className="h-12 w-24 shrink-0 rounded-8 object-cover"
                />
                <div className="min-w-[160px] flex-1">
                  <p className="m-0 text-[15px] font-semibold text-ink">
                    {b.titulo ?? "(sem título)"}
                  </p>
                  <p className="mt-[2px] text-[12.5px] text-muted">
                    {b.destino_tipo === "none"
                      ? "Sem destino"
                      : b.destino_tipo === "external"
                        ? `Link externo: ${b.url_externa}`
                        : b.destino_tipo === "products"
                          ? `${b.itens} ${b.itens === 1 ? "produto" : "produtos"}: ${b.destino_nome ?? "—"}`
                          : `Destino: ${b.destino_nome ?? "—"}`}
                    {b.dias && b.dias.length < 7
                      ? ` · ${[...b.dias].sort((x, y) => x - y).map((n) => DIA_CURTO[n]).join(", ")}`
                      : ""}
                  </p>
                </div>
                {b.tem_popup ? <StatusBadge tom="info">Popup</StatusBadge> : null}
                <StatusBadge tom={b.visivel_agora ? "sucesso" : "neutro"}>
                  {b.visivel_agora ? "Aparece agora" : b.ativo ? "Fora do ar" : "Desativado"}
                </StatusBadge>
                {podeGerenciar ? (
                  <>
                    <BotaoAcao
                      acao={alternarAtivoBanner}
                      campos={{ id: b.id, ativar: String(!b.ativo) }}
                    >
                      {b.ativo ? "Desativar" : "Ativar"}
                    </BotaoAcao>
                    <BotaoAcao
                      acao={removerBanner}
                      campos={{ id: b.id }}
                      tom="perigo"
                      confirmar="Excluir este banner?"
                    >
                      Excluir
                    </BotaoAcao>
                  </>
                ) : null}
              </LinhaLista>
            )),
          )}
        </Cartao>
      )}

      {podeGerenciar ? (
        <NovoItem
          titulo="Novo banner"
          descricao="Dois passos: primeiro a imagem, depois onde o banner leva."
          aberto={banners.length === 0}
        >
          <div className="flex flex-col gap-5">
            <section aria-labelledby="banner-passo-1" className="flex flex-col gap-2">
              <h4 id="banner-passo-1" className="m-0 text-[14px] font-bold text-ink">
                Passo 1 · Enviar a imagem
              </h4>
              <p className="m-0 text-[12.5px] text-muted">
                Envie a arte do carrossel na proporção 2:1 (horizontal). Para o popup de abertura,
                envie também uma em retrato 1:2 (por exemplo 800×1600).
                {imagens.length > 0
                  ? ` Você já tem ${imagens.length} ${imagens.length === 1 ? "imagem enviada" : "imagens enviadas"} — pode pular para o passo 2.`
                  : ""}
              </p>
              <FormularioAcao
                acao={enviarImagem}
                rotulo="Enviar imagem"
                variante="secundario"
                limparAoSalvar
              >
                <input type="hidden" name="uso" value="banner" />
                <Input
                  label="Arquivo"
                  name="arquivo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  hint="Carrossel: 1600×800 px (2:1). Popup: 800×1600 px (1:2). JPEG, PNG, WebP ou AVIF, até 8 MB. Imagens em outra proporção podem ser recortadas."
                  required
                />
              </FormularioAcao>
            </section>

            <hr className="m-0 border-0 border-t border-border-shalon" />

            <section aria-labelledby="banner-passo-2" className="flex flex-col gap-2">
              <h4 id="banner-passo-2" className="m-0 text-[14px] font-bold text-ink">
                Passo 2 · Montar o banner
              </h4>
              {imagens.length === 0 ? (
                <p className="m-0 text-[13.5px] text-muted">
                  Envie uma imagem no passo 1 — banner sem imagem não é aceito.
                </p>
              ) : (
                <FormularioAcao acao={salvarBanner} rotulo="Criar banner" limparAoSalvar>
                  <SeletorDeImagem
                    name="imagem_id"
                    label="Imagem do carrossel"
                    proporcao="2 / 1"
                    obrigatorio
                    opcoes={opcoesLargas}
                    vazio="Nenhuma imagem horizontal (2:1) enviada. Envie uma no passo 1."
                  />
                  <SeletorDeImagem
                    name="popup_imagem_id"
                    label="Imagem do popup (opcional)"
                    proporcao="1 / 2"
                    opcional
                    rotuloNenhuma="Sem popup"
                    opcoes={opcoesRetrato}
                    vazio="Sem arte em retrato (1:2) enviada: sem ela, o banner não gera popup. Envie uma no passo 1."
                  />
                  <Input label="Título (opcional)" name="titulo" />
                  <Input label="Texto (opcional)" name="corpo" />

                  <DestinoDoBanner
                    promocoes={campanhasParaBanner.map((c) => ({
                      id: c.idRepresentante,
                      texto: c.itens > 1 ? `${c.nome} (${c.itens} itens)` : c.nome,
                    }))}
                    categorias={categorias
                      .filter((c) => c.is_active)
                      .map((c) => ({ id: c.id, nome: c.name }))}
                    produtos={produtos.filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome }))}
                    produtosParaDestaque={produtos
                      .filter((p) => p.ativo)
                      .map((p) => ({
                        valor: p.id,
                        nome: p.nome,
                        detalhe: p.preco_base === null ? "" : formatBRL(p.preco_base),
                        grupo: p.categoria_nome,
                        imagem: p.imagem_path ? (fotosDosProdutos.get(p.imagem_path) ?? null) : null,
                      }))}
                  />

                  <QuandoValeAPromocao variante="banner" />
                  <Input label="Ordem no carrossel" name="ordem" type="number" defaultValue={0} min={0} />
                </FormularioAcao>
              )}
            </section>
          </div>
        </NovoItem>
      ) : null}
    </div>
  );
}

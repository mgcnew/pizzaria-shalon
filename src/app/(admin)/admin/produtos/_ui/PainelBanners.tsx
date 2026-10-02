import Image from "next/image";
import { StatusBadge, Input, SelectMenu, CampoDataHora } from "@/ui/components";
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
import { FormularioAcao } from "./FormularioAcao";
import { BotaoAcao } from "./BotaoAcao";

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
export async function PainelBanners({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [banners, imagens, produtos, categorias, promocoes] = await Promise.all([
    listarBanners(),
    listarImagens("banner"),
    listarProdutos(),
    listarCategorias(),
    listarPromocoes(),
  ]);

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
                        : `Destino: ${b.destino_nome ?? "—"}`}
                  </p>
                </div>
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
                    <BotaoAcao acao={removerBanner} campos={{ id: b.id }} tom="perigo">
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
      <>
      <Cartao largura="cheio"
        titulo="Enviar imagem de banner"
        descricao="Use uma imagem horizontal na proporção 2:1 para preencher corretamente o carrossel promocional."
      >
        <FormularioAcao acao={enviarImagem} rotulo="Enviar imagem" variante="secundario">
          <input type="hidden" name="uso" value="banner" />
          <Input
            label="Arquivo"
            name="arquivo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            hint="Recomendado: 1600×800 px ou 1200×600 px (proporção 2:1). JPEG, PNG, WebP ou AVIF, até 8 MB. Imagens em outra proporção podem ser recortadas."
            required
          />
        </FormularioAcao>
      </Cartao>

      <Cartao largura="cheio"
        titulo="Novo banner"
        descricao="Para divulgar uma promoção no carrossel, escolha Promoção no campo Destino. O banner sairá do ar junto com o fim da oferta."
      >
        {imagens.length === 0 ? (
          <p className="m-0 text-[13.5px] text-muted">
            Envie uma imagem primeiro — banner sem imagem não é aceito.
          </p>
        ) : (
          <FormularioAcao acao={salvarBanner} rotulo="Criar banner">
            <SelectMenu
              label="Imagem"
              name="imagem_id"
              required
              placeholder="Escolha a imagem"
              opcoes={imagens.map((i) => ({
                valor: i.id,
                texto: `${i.original_filename ?? i.storage_path} (${i.width}×${i.height})`,
              }))}
            />
            <Input label="Título (opcional)" name="titulo" />
            <Input label="Texto (opcional)" name="corpo" />

            <SelectMenu
              label="Destino"
              name="destino"
              valorInicial="none"
              opcoes={[
                { valor: "none", texto: "Sem destino" },
                { valor: "external", texto: "Link externo" },
                ...produtos
                  .filter((p) => p.ativo)
                  .map((p) => ({ valor: `product:${p.id}`, texto: p.nome, grupo: "Produto" })),
                ...categorias
                  .filter((c) => c.is_active)
                  .map((c) => ({ valor: `category:${c.id}`, texto: c.name, grupo: "Categoria" })),
                ...promocoes.map((p) => ({ valor: `promotion:${p.id}`, texto: p.nome, grupo: "Promoção" })),
              ]}
            />

            <Input
              label="URL externa"
              name="url_externa"
              type="url"
              placeholder="https://..."
              hint="Preencha somente se o destino for Link externo."
            />
            <CampoDataHora label="Começa em (opcional)" name="inicio" modo="dataHora" />
            <CampoDataHora label="Termina em (opcional)" name="fim" modo="dataHora" />
            <Input label="Ordem" name="ordem" type="number" defaultValue={0} min={0} />
          </FormularioAcao>
        )}
      </Cartao>
      </>
      ) : null}
    </div>
  );
}

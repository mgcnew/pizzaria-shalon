import Image from "next/image";
import { StatusBadge, Input, Select } from "@/ui/components";
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
      <Cartao
        titulo="Enviar imagem de banner"
        descricao="Prefira uma imagem horizontal na proporção 2:1 (recomendado: 1600×800). Ela será redimensionada e convertida para WebP."
      >
        <FormularioAcao acao={enviarImagem} rotulo="Enviar imagem" variante="secundario">
          <input type="hidden" name="uso" value="banner" />
          <Input
            label="Arquivo"
            name="arquivo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            required
          />
        </FormularioAcao>
      </Cartao>

      <Cartao titulo="Novo banner">
        {imagens.length === 0 ? (
          <p className="m-0 text-[13.5px] text-muted">
            Envie uma imagem primeiro — banner sem imagem não é aceito.
          </p>
        ) : (
          <FormularioAcao acao={salvarBanner} rotulo="Criar banner">
            <Select label="Imagem" name="imagem_id" required defaultValue="">
              <option value="" disabled>
                Escolha a imagem
              </option>
              {imagens.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.original_filename ?? i.storage_path} ({i.width}×{i.height})
                </option>
              ))}
            </Select>
            <Input label="Título (opcional)" name="titulo" />
            <Input label="Texto (opcional)" name="corpo" />

            <Select label="Destino" name="destino" defaultValue="none">
              <option value="none">Sem destino</option>
              <option value="external">Link externo</option>
              <optgroup label="Produto">
                {produtos
                  .filter((p) => p.ativo)
                  .map((p) => (
                    <option key={p.id} value={`product:${p.id}`}>
                      {p.nome}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Categoria">
                {categorias
                  .filter((c) => c.is_active)
                  .map((c) => (
                    <option key={c.id} value={`category:${c.id}`}>
                      {c.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Promoção">
                {promocoes.map((p) => (
                  <option key={p.id} value={`promotion:${p.id}`}>
                    {p.nome}
                  </option>
                ))}
              </optgroup>
            </Select>

            <Input
              label="URL externa"
              name="url_externa"
              type="url"
              placeholder="https://..."
              hint="Preencha somente se o destino for Link externo."
            />
            <Input label="Começa em (opcional)" name="inicio" type="datetime-local" />
            <Input label="Termina em (opcional)" name="fim" type="datetime-local" />
            <Input label="Ordem" name="ordem" type="number" defaultValue={0} min={0} />
          </FormularioAcao>
        )}
      </Cartao>
      </>
      ) : null}
    </div>
  );
}

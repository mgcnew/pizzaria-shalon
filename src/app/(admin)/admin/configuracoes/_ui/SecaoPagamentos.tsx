import { Input, Select, StatusBadge, Textarea } from "@/ui/components";
import { Cartao, LinhaLista, ParDeDados } from "@/ui/patterns";
import {
  listarBandeiras,
  listarFormasPagamento,
  obterChavePix,
} from "@/application/configuracoes/consultas";
import {
  alternarFormaPagamento,
  salvarBandeira,
  removerBandeira,
  salvarPix,
} from "@/application/configuracoes/acoes";
import { FormularioAcao } from "@/app/(admin)/admin/produtos/_ui/FormularioAcao";
import { BotaoAcao } from "@/app/(admin)/admin/produtos/_ui/BotaoAcao";

/**
 * Pagamentos — seção do design, com os três cartões: "Formas aceitas",
 * "Bandeiras por forma" e "Pix". O texto do protótipo continua verdadeiro e
 * foi preservado: cartão é pago fisicamente, sem gateway online; a
 * confirmação do Pix é manual, sem integração bancária.
 *
 * RN-PGTO-007 e RN-PGTO-008: Pix na maquininha e Pix antecipado por chave são
 * formas DISTINTAS. A segunda só aparece para o cliente quando a chave estiver
 * cadastrada e habilitada — por isso ela nasce inativa.
 *
 * A chave Pix é dado sensível: a auditoria registra que mudou, quem mudou e
 * quando, mas NÃO transporta o valor (03 §7.2 e §31).
 */
export async function SecaoPagamentos({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [formas, bandeiras, pix] = await Promise.all([
    listarFormasPagamento(),
    listarBandeiras(),
    obterChavePix(),
  ]);

  const comBandeira = formas.filter((f) => f.requires_brand);

  return (
    <div className="grid items-start gap-[14px] [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
      <Cartao titulo="Formas aceitas" largura="cheio">
        {formas.map((f) => (
          <LinhaLista key={f.id}>
            <span className="min-w-[120px] flex-1 text-[14px] font-semibold text-ink">
              {f.name}
            </span>
            <StatusBadge tom={f.is_active ? "sucesso" : "neutro"}>
              {f.is_active ? "Aceita" : "Desativada"}
            </StatusBadge>
            {podeGerenciar ? (
              <BotaoAcao
                acao={alternarFormaPagamento}
                campos={{ id: f.id, ativar: String(!f.is_active) }}
              >
                Alternar
              </BotaoAcao>
            ) : null}
          </LinhaLista>
        ))}
        <p className="mt-3 text-[12.5px] text-muted">
          Cartão é pago fisicamente na entrega ou no balcão. Não há gateway online nesta versão.
        </p>
      </Cartao>

      <Cartao titulo="Bandeiras por forma" largura="cheio">
        {comBandeira.map((f) => {
          const doTipo = bandeiras.filter((b) => b.payment_method_id === f.id);
          return (
            <div key={f.id} className="border-b border-border-shalon py-[10px] last:border-b-0">
              <p className="m-0 mb-[7px] text-[12px] font-bold uppercase tracking-[0.05em] text-muted">
                {f.name}
              </p>
              <div className="flex flex-wrap items-center gap-[7px]">
                {doTipo.length === 0 ? (
                  <span className="text-[13px] text-muted">
                    Nenhuma bandeira cadastrada — esta forma não poderá ser escolhida no checkout.
                  </span>
                ) : (
                  doTipo.map((b) => (
                    <span
                      key={b.id}
                      className="inline-flex items-center gap-2 rounded-pill border-[1.5px] border-border-shalon px-[11px] py-[5px] text-[13px] font-semibold text-ink"
                    >
                      {b.name}
                      {podeGerenciar ? (
                        <BotaoAcao acao={removerBandeira} campos={{ id: b.id }} tom="perigo">
                          ×
                        </BotaoAcao>
                      ) : null}
                    </span>
                  ))
                )}
              </div>
              {podeGerenciar ? (
                <div className="mt-2">
                  <FormularioAcao
                    acao={salvarBandeira}
                    rotulo="Adicionar"
                    variante="secundario"
                    tamanho="sm"
                  >
                    <input type="hidden" name="forma_id" value={f.id} />
                    <Input
                      label={`Nova bandeira de ${f.name}`}
                      name="nome"
                      required
                      placeholder="Ex.: Visa"
                    />
                  </FormularioAcao>
                </div>
              ) : null}
            </div>
          );
        })}
      </Cartao>

      <Cartao titulo="Pix antecipado" largura="cheio">
        <ParDeDados
          chave="Situação"
          valor={
            <StatusBadge tom={pix?.is_enabled ? "sucesso" : "neutro"}>
              {pix?.is_enabled ? "Habilitado" : "Desabilitado"}
            </StatusBadge>
          }
        />
        <ParDeDados chave="Tipo de chave" valor={pix?.key_type ?? "—"} />
        <ParDeDados chave="Recebedor" valor={pix?.recipient_name ?? "—"} />
        <p className="mt-3 text-[12.5px] text-muted">
          Sem integração bancária: a confirmação do Pix é manual. Selecionar Pix não marca o pedido
          como pago — quem confirma é uma pessoa autorizada, e fica registrado quem e quando.
        </p>

        {podeGerenciar ? (
          <div className="mt-3">
            <FormularioAcao acao={salvarPix} rotulo="Salvar Pix">
              <label className="flex min-h-touch items-center gap-[10px] text-[14px] font-semibold text-ink">
                <input
                  type="checkbox"
                  name="habilitado"
                  defaultChecked={pix?.is_enabled ?? false}
                  className="h-5 w-5 accent-[var(--brand-orange)]"
                />
                Oferecer Pix antecipado no checkout
              </label>
              <Select label="Tipo de chave" name="tipo" defaultValue={pix?.key_type ?? ""}>
                <option value="">Não definido</option>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="email">E-mail</option>
                <option value="telefone">Telefone</option>
                <option value="aleatoria">Aleatória</option>
              </Select>
              <Input label="Chave Pix" name="chave" defaultValue={pix?.pix_key ?? ""} />
              <Input
                label="Nome do recebedor"
                name="recebedor"
                defaultValue={pix?.recipient_name ?? ""}
              />
              <Textarea
                label="Instruções ao cliente"
                name="instrucoes"
                defaultValue={pix?.instructions ?? ""}
                rows={3}
              />
            </FormularioAcao>
          </div>
        ) : null}
      </Cartao>
    </div>
  );
}

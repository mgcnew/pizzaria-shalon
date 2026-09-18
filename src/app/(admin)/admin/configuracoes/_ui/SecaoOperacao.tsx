import { Input, StatusBadge } from "@/ui/components";
import { Cartao, LinhaLista } from "@/ui/patterns";
import { listarLimitesDeAlerta, obterLoja } from "@/application/configuracoes/consultas";
import {
  salvarEstimativas,
  salvarLimiteDeAlerta,
  alternarAtivoLimite,
  alternarAdicionais,
} from "@/application/configuracoes/acoes";
import { CHAVES_DE_ALERTA } from "@/application/configuracoes/tipos";
import { FormularioAcao } from "@/app/(admin)/admin/produtos/_ui/FormularioAcao";
import { BotaoAcao } from "@/app/(admin)/admin/produtos/_ui/BotaoAcao";

/**
 * "Operação do pedido" — seção do design, que no protótipo era lista de pares
 * chave/valor somente leitura. Aqui os mesmos parâmetros são editáveis, que é
 * o que a Fase 3 pede: "Mantenha regras operacionais configuráveis no banco,
 * não hardcoded no frontend".
 *
 * RN-LOJA-004: entrega e retirada têm estimativas INDEPENDENTES, e pode
 * existir um override temporário — o prazo de hoje, sem perder o padrão.
 *
 * Os limites de alerta (02 §3.4) existem para o dashboard da Fase 8 não ter
 * número mágico no código. As CHAVES são conhecidas; os MINUTOS são decisão
 * da Shalon e não foram semeados com valor inventado.
 */
export async function SecaoOperacao({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [loja, limites] = await Promise.all([obterLoja(), listarLimitesDeAlerta()]);

  if (!loja) {
    return (
      <Cartao titulo="Operação do pedido">
        <p className="m-0 text-[13.5px] text-ink-2">
          Configure os dados da loja primeiro — os tempos estimados pertencem a ela.
        </p>
      </Cartao>
    );
  }

  const porChave = new Map(limites.map((l) => [l.alert_key, l]));
  const temOverride =
    loja.current_delivery_eta_min_minutes !== null ||
    loja.current_pickup_eta_min_minutes !== null;

  return (
    <div className="flex flex-col gap-4">
      <Cartao
        titulo="Tempos estimados"
        descricao="O padrão vale sempre; o override temporário vale enquanto existir e é o que o cliente vê."
      >
        {temOverride ? (
          <p className="mb-3 rounded-12 border border-twb bg-tw px-3 py-[10px] text-[13.5px] font-semibold text-twf">
            Há um override temporário ativo. É ele que aparece para o cliente agora.
          </p>
        ) : null}

        {podeGerenciar ? (
          <FormularioAcao acao={salvarEstimativas} rotulo="Salvar tempos">
            <Input label="Entrega: mínimo (min)" name="entrega_min" type="number" min={1} required defaultValue={loja.delivery_eta_min_minutes} />
            <Input label="Entrega: máximo (min)" name="entrega_max" type="number" min={1} required defaultValue={loja.delivery_eta_max_minutes} />
            <Input label="Retirada: mínimo (min)" name="retirada_min" type="number" min={1} required defaultValue={loja.pickup_eta_min_minutes} />
            <Input label="Retirada: máximo (min)" name="retirada_max" type="number" min={1} required defaultValue={loja.pickup_eta_max_minutes} />

            <p className="m-0 mt-2 text-[12px] font-bold uppercase tracking-[0.05em] text-muted">
              Override de hoje (deixe em branco para não usar)
            </p>
            <Input label="Entrega hoje: mínimo" name="override_entrega_min" type="number" min={1} defaultValue={loja.current_delivery_eta_min_minutes ?? ""} />
            <Input label="Entrega hoje: máximo" name="override_entrega_max" type="number" min={1} defaultValue={loja.current_delivery_eta_max_minutes ?? ""} />
            <Input label="Retirada hoje: mínimo" name="override_retirada_min" type="number" min={1} defaultValue={loja.current_pickup_eta_min_minutes ?? ""} />
            <Input label="Retirada hoje: máximo" name="override_retirada_max" type="number" min={1} defaultValue={loja.current_pickup_eta_max_minutes ?? ""} />
          </FormularioAcao>
        ) : (
          <>
            <LinhaLista>
              <span className="flex-1 text-[13.5px] text-muted">Entrega</span>
              <span className="text-[13.5px] font-semibold text-ink">
                {loja.current_delivery_eta_min_minutes ?? loja.delivery_eta_min_minutes}–
                {loja.current_delivery_eta_max_minutes ?? loja.delivery_eta_max_minutes} min
              </span>
            </LinhaLista>
            <LinhaLista>
              <span className="flex-1 text-[13.5px] text-muted">Retirada</span>
              <span className="text-[13.5px] font-semibold text-ink">
                {loja.current_pickup_eta_min_minutes ?? loja.pickup_eta_min_minutes}–
                {loja.current_pickup_eta_max_minutes ?? loja.pickup_eta_max_minutes} min
              </span>
            </LinhaLista>
          </>
        )}
      </Cartao>

      <Cartao titulo="Adicionais" descricao="O recurso inteiro pode ser desligado de uma vez.">
        <LinhaLista>
          <span className="flex-1 text-[14px] font-semibold text-ink">
            Adicionais no cardápio
          </span>
          <StatusBadge tom={loja.addons_enabled ? "sucesso" : "neutro"}>
            {loja.addons_enabled ? "Ligados" : "Desligados"}
          </StatusBadge>
          {podeGerenciar ? (
            <BotaoAcao acao={alternarAdicionais} campos={{ ligar: String(!loja.addons_enabled) }}>
              {loja.addons_enabled ? "Desligar" : "Ligar"}
            </BotaoAcao>
          ) : null}
        </LinhaLista>
      </Cartao>

      <Cartao
        titulo="Limites de alerta"
        descricao="Quanto tempo uma pendência pode esperar antes de virar alerta no painel."
        largura="cheio"
      >
        {CHAVES_DE_ALERTA.map((a) => {
          const atual = porChave.get(a.chave);
          return (
            <LinhaLista key={a.chave}>
              <span className="min-w-[200px] flex-1 text-[14px] font-semibold text-ink">
                {a.rotulo}
              </span>
              <span className="text-[13.5px] text-ink-2">
                {atual ? `${atual.threshold_minutes} min` : "não configurado"}
              </span>
              {atual ? (
                <StatusBadge tom={atual.is_active ? "sucesso" : "neutro"}>
                  {atual.is_active ? "Ativo" : "Inativo"}
                </StatusBadge>
              ) : null}
              {podeGerenciar ? (
                <>
                  <FormularioAcao
                    acao={salvarLimiteDeAlerta}
                    rotulo="Salvar"
                    variante="secundario"
                    tamanho="sm"
                  >
                    <input type="hidden" name="chave" value={a.chave} />
                    <Input
                      label="Minutos"
                      name="minutos"
                      type="number"
                      min={1}
                      required
                      defaultValue={atual?.threshold_minutes ?? ""}
                      labelOculto
                    />
                  </FormularioAcao>
                  {atual ? (
                    <BotaoAcao
                      acao={alternarAtivoLimite}
                      campos={{ id: atual.id, ativar: String(!atual.is_active) }}
                    >
                      {atual.is_active ? "Desativar" : "Ativar"}
                    </BotaoAcao>
                  ) : null}
                </>
              ) : null}
            </LinhaLista>
          );
        })}
        <p className="mt-3 text-[12.5px] text-muted">
          Os alertas em si aparecem no painel a partir da Fase 8. O que existe aqui é a
          configuração, para que aquele painel não nasça com número fixo no código.
        </p>
      </Cartao>
    </div>
  );
}

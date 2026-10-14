"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/ui/components";
import { Aviso, Cartao, ParDeDados } from "@/ui/patterns";
import { COLUNAS, type Papel } from "@/domain/pedidos/comanda";
import {
  ESPACO_FINAL_MM,
  MARGEM_ESQUERDA_MM,
  imprimeDireto,
  podeSerBalcao,
  salvarImpressoraDoAparelho,
  useImpressoraDoAparelho,
  type EspacoFinal,
  type MargemEsquerda,
  type ImpressoraDoAparelho,
  type ModoDeImpressao,
} from "@/ui/impressao/impressoraDoAparelho";
import { imprimirLinhas, linhasDeTeste } from "@/ui/impressao/imprimir";
import { imprimirNoAparelho } from "@/ui/impressao/imprimirNoAparelho";
import type { TabelaDeAcentos } from "@/ui/impressao/escpos";
import {
  ErroDaImpressora,
  escolherImpressoraSerial,
  esquecerImpressoraSerial,
  impressoraLembrada,
  serialDisponivel,
} from "@/ui/impressao/serial";

/**
 * "Impressora" — seção do design aprovado, que ficou de fora enquanto não
 * havia equipamento para provar (A-08). Agora existe (D-2026-10-08-116).
 *
 * DIFERENÇA DELIBERADA EM RELAÇÃO ÀS OUTRAS SEÇÕES: isto não é configuração
 * da loja. Vale só para o aparelho em que foi feito, porque a impressora
 * está ligada nele. Por isso não passa por `settings.manage` nem vai para a
 * auditoria — não muda nada para ninguém além de quem está neste aparelho.
 */

const PAPEIS: { valor: Papel; titulo: string; detalhe: string }[] = [
  { valor: "80", titulo: "80 mm", detalhe: `Impressora de balcão. ${COLUNAS["80"]} colunas.` },
  { valor: "58", titulo: "58 mm", detalhe: `Impressora portátil. ${COLUNAS["58"]} colunas.` },
];

const MODOS: { valor: ModoDeImpressao; titulo: string; detalhe: string }[] = [
  {
    valor: "sistema",
    titulo: "Imprimir direto",
    detalhe: "Manda para a impressora padrão deste aparelho assim que a comanda é emitida.",
  },
  {
    valor: "serial",
    titulo: "Bluetooth direto",
    detalhe:
      "Fala direto com a impressora Bluetooth, como a de 58 mm, sem RawBT. A impressora é escolhida uma vez, aqui.",
  },
  {
    valor: "balcao",
    titulo: "Imprimir na impressora do balcão",
    detalhe:
      "Para o celular: a comanda sai na 80 mm do notebook. O notebook precisa estar ligado, com o painel aberto.",
  },
  {
    valor: "tela",
    titulo: "Só mostrar na tela",
    detalhe: "A comanda aparece para conferir; a impressão é feita por fora do sistema.",
  },
];

const ESTACAO: { valor: "sim" | "nao"; titulo: string; detalhe: string }[] = [
  {
    valor: "sim",
    titulo: "Sim, este é o balcão",
    detalhe: "Com o painel aberto, imprime as comandas que os celulares pedirem.",
  },
  { valor: "nao", titulo: "Não", detalhe: "Imprime só o que for emitido neste aparelho." },
];

const TABELAS: { valor: TabelaDeAcentos; titulo: string; detalhe: string }[] = [
  { valor: "cp860", titulo: "Português (CP860)", detalhe: "A primeira a tentar." },
  { valor: "cp850", titulo: "Multilíngue (CP850)", detalhe: "Se a CP860 trocar letras acentuadas." },
  {
    valor: "sem-acento",
    titulo: "Sem acentos",
    detalhe: "Se nenhuma funcionar: \"Açúcar\" sai \"Acucar\", mas sempre legível.",
  },
];

const ESPACOS: { valor: EspacoFinal; titulo: string; detalhe: string }[] = [
  { valor: "normal", titulo: "Normal", detalhe: `${ESPACO_FINAL_MM.normal} mm. Para impressora sem guilhotina.` },
  { valor: "medio", titulo: "Médio", detalhe: `${ESPACO_FINAL_MM.medio} mm.` },
  {
    valor: "grande",
    titulo: "Grande",
    detalhe: `${ESPACO_FINAL_MM.grande} mm. Para impressora com guilhotina que corta o fim do documento, como a Diebold.`,
  },
];

const MARGENS: { valor: MargemEsquerda; titulo: string; detalhe: string }[] = [
  { valor: "nenhuma", titulo: "Nenhuma", detalhe: "O documento começa na borda do papel." },
  { valor: "pequena", titulo: "Pequena", detalhe: `${MARGEM_ESQUERDA_MM.pequena} mm. Se a primeira letra sai cortada.` },
  { valor: "media", titulo: "Média", detalhe: `${MARGEM_ESQUERDA_MM.media} mm. Se com a pequena ainda corta.` },
];

const ATALHO_CHROME = '"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing';

function Opcoes<T extends string>({
  rotulo,
  opcoes,
  atual,
  aoEscolher,
}: {
  rotulo: string;
  opcoes: { valor: T; titulo: string; detalhe: string }[];
  atual: T;
  aoEscolher: (valor: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-col gap-2">
      <p className="m-0 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">{rotulo}</p>
      {opcoes.map((opcao) => {
        const ativa = opcao.valor === atual;
        return (
          <button
            key={opcao.valor}
            type="button"
            role="radio"
            aria-checked={ativa}
            onClick={() => aoEscolher(opcao.valor)}
            className={[
              "flex min-h-touch w-full cursor-pointer items-start gap-3 rounded-12 border-[1.5px] px-3 py-2.5 text-left",
              ativa ? "border-brand-red bg-elev" : "border-border-shalon bg-surface hover:border-brand-orange",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className={[
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                ativa ? "border-brand-red" : "border-border-shalon",
              ].join(" ")}
            >
              {ativa ? <span className="h-2.5 w-2.5 rounded-full bg-brand-red" /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold text-ink">{opcao.titulo}</span>
              <span className="block text-[12.5px] text-ink-2">{opcao.detalhe}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function SecaoImpressora() {
  const impressora = useImpressoraDoAparelho();
  const [aviso, setAviso] = useState<{ erro?: string; ok?: string }>({});
  const [imprimindo, setImprimindo] = useState(false);
  const [copiado, setCopiado] = useState(false);

  function salvar(nova: typeof impressora) {
    const guardou = salvarImpressoraDoAparelho(nova);
    setAviso(
      guardou
        ? { ok: "Salvo neste aparelho." }
        : {
            erro: "Este navegador não deixou guardar a configuração (aba anônima ou dados bloqueados). Ela vale só até fechar a aba.",
          },
    );
  }

  async function testar() {
    setAviso({});
    setImprimindo(true);
    try {
      const linhas = linhasDeTeste(impressora.papel);
      if (imprimeDireto(impressora.modo)) await imprimirNoAparelho(linhas, impressora);
      else
        await imprimirLinhas(
          linhas,
          impressora.papel,
          ESPACO_FINAL_MM[impressora.espacoFinal],
          MARGEM_ESQUERDA_MM[impressora.margemEsquerda],
        );
      setAviso({ ok: "Teste enviado. Confira se a régua coube numa linha só e se os acentos saíram certos." });
    } catch (falha) {
      setAviso({
        erro:
          falha instanceof ErroDaImpressora
            ? falha.message
            : "O navegador não conseguiu enviar o teste para a impressora.",
      });
    } finally {
      setImprimindo(false);
    }
  }

  async function copiarAtalho() {
    try {
      await navigator.clipboard.writeText(ATALHO_CHROME);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Cartao
        titulo="Impressora deste aparelho"
        descricao="Vale só para este computador ou celular. Cada aparelho guarda a sua — mudar aqui não muda nos outros."
      >
        <div className="flex flex-col gap-4">
          <Opcoes
            rotulo="Papel"
            opcoes={PAPEIS}
            atual={impressora.papel}
            aoEscolher={(papel) => salvar({ ...impressora, papel })}
          />
          <Opcoes
            rotulo="Ao emitir a comanda"
            opcoes={MODOS}
            atual={impressora.modo}
            aoEscolher={(modo) => salvar({ ...impressora, modo })}
          />
          {impressora.modo === "serial" ? (
            <BluetoothDireto
              impressora={impressora}
              aoSalvar={salvar}
              aoAvisar={setAviso}
            />
          ) : null}
          {podeSerBalcao(impressora) ? (
            <Opcoes
              rotulo="Imprimir também o que os celulares pedirem?"
              opcoes={ESTACAO}
              atual={impressora.estacao ? "sim" : "nao"}
              aoEscolher={(v) => salvar({ ...impressora, estacao: v === "sim" })}
            />
          ) : null}
          {impressora.estacao && impressora.modo === "sistema" ? (
            <p className="m-0 rounded-12 border border-tib bg-ti px-3 py-[10px] text-[13px] font-semibold text-tif">
              Deixe o Chrome aberto pelo atalho do balcão (abaixo). Sem ele, cada pedido dos celulares abre a
              janela de impressão e fica parado esperando alguém clicar.
            </p>
          ) : null}

          {impressora.modo !== "balcao" ? (
            <Opcoes
              rotulo="Espaço no fim do papel"
              opcoes={ESPACOS}
              atual={impressora.espacoFinal}
              aoEscolher={(espacoFinal) => salvar({ ...impressora, espacoFinal })}
            />
          ) : null}
          {impressora.modo === "sistema" || impressora.modo === "tela" ? (
            <Opcoes
              rotulo="Margem à esquerda"
              opcoes={MARGENS}
              atual={impressora.margemEsquerda}
              aoEscolher={(margemEsquerda) => salvar({ ...impressora, margemEsquerda })}
            />
          ) : null}

          <div>
            <ParDeDados chave="Documento" valor="Comanda não fiscal" />
            <ParDeDados chave="Reimpressão" valor="Fica registrada, com autor e horário" />
            <ParDeDados chave="Cupons do PDV e fechamento de caixa" valor={`Saem em ${impressora.papel} mm`} />
          </div>

          <Aviso {...aviso} />

          <div>
            <Button type="button" variante="secundario" disabled={imprimindo} onClick={testar}>
              {imprimindo ? "Enviando…" : "Teste de impressão"}
            </Button>
          </div>
        </div>
      </Cartao>

      {impressora.modo !== "serial" ? (
      <Cartao
        titulo="Imprimir sem a janela de escolha (Windows)"
        descricao="Por segurança, o navegador sempre pergunta a impressora — a não ser que seja aberto por um atalho preparado para o balcão. Faz-se uma vez só."
      >
        <ol className="m-0 flex list-decimal flex-col gap-3 pl-5 text-[13.5px] text-ink">
          <li>
            Instale o driver da impressora de 80 mm e deixe-a como <strong>impressora padrão</strong>{" "}
            em Configurações do Windows → Bluetooth e dispositivos → Impressoras e scanners.
            Desligue a opção &quot;Permitir que o Windows gerencie minha impressora padrão&quot;.
          </li>
          <li>
            Nas preferências da impressora, confira que o papel é o <strong>rolo de 80 mm</strong>.
          </li>
          <li>
            Desligue o Chrome em segundo plano: abra <code className="font-mono">chrome://settings/system</code>{" "}
            e desligue <strong>&quot;Continuar executando apps em segundo plano quando o Google Chrome for
            fechado&quot;</strong>. Se o Chrome continuar rodando escondido, o atalho é ignorado.
          </li>
          <li>
            Coloque <code className="font-mono">--kiosk-printing</code> no fim do campo <strong>Destino</strong>{" "}
            do atalho que você usa para abrir o sistema (botão direito → Propriedades):
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-5">
              <li>
                <strong>Sistema instalado como app</strong> (ícone próprio da Shalon): edite o atalho do app,
                na Área de Trabalho e no Menu Iniciar. O Destino já tem algo como{" "}
                <code className="font-mono">--app-id=…</code>; acrescente um espaço e{" "}
                <code className="font-mono">--kiosk-printing</code> depois disso. Se o app estiver fixado na
                barra de tarefas, desafixe e fixe de novo a partir do atalho já editado.
              </li>
              <li>
                <strong>Pelo Chrome comum:</strong> o atalho do Chrome fica assim:
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <code className="min-w-0 break-all rounded-10 bg-elev px-3 py-2 font-mono text-[12px] text-ink">
                    {ATALHO_CHROME}
                  </code>
                  <Button type="button" variante="fantasma" tamanho="sm" onClick={copiarAtalho}>
                    {copiado ? "Copiado" : "Copiar"}
                  </Button>
                </div>
              </li>
            </ul>
          </li>
          <li>
            Feche <strong>todas</strong> as janelas do Chrome e do app (confira também o ícone perto do relógio) e
            abra pelo atalho editado. Aqui, escolha 80 mm e &quot;Imprimir direto&quot;, e faça o teste de
            impressão.
          </li>
          <li>
            Ainda abriu a janela? Abra <code className="font-mono">chrome://version</code> numa aba e veja a linha{" "}
            <strong>Linha de comando</strong>. Se <code className="font-mono">--kiosk-printing</code> não estiver
            lá, o Chrome foi aberto por outro atalho ou já estava rodando.
          </li>
        </ol>
        <p className="mb-0 mt-3 text-[12.5px] text-muted">
          No Microsoft Edge funciona igual, com <code className="font-mono">msedge.exe --kiosk-printing</code>. O
          atalho não muda mais nada no navegador: só tira a janela de escolha da impressão.
        </p>
      </Cartao>
      ) : null}
    </div>
  );
}


async function situacaoDoBluetooth(): Promise<"sem-suporte" | "nenhuma" | "escolhida"> {
  if (!serialDisponivel()) return "sem-suporte";
  return (await impressoraLembrada()) === null ? "nenhuma" : "escolhida";
}

/**
 * A impressora Bluetooth deste aparelho: escolher (uma vez), trocar,
 * esquecer, e a tabela de acentos.
 */
function BluetoothDireto({
  impressora,
  aoSalvar,
  aoAvisar,
}: {
  impressora: ImpressoraDoAparelho;
  aoSalvar: (nova: ImpressoraDoAparelho) => void;
  aoAvisar: (aviso: { erro?: string; ok?: string }) => void;
}) {
  const [situacao, setSituacao] = useState<"verificando" | "sem-suporte" | "nenhuma" | "escolhida">(
    "verificando",
  );

  const verificar = useCallback(async () => {
    setSituacao(await situacaoDoBluetooth());
  }, []);

  useEffect(() => {
    let vivo = true;
    void situacaoDoBluetooth().then((s) => {
      if (vivo) setSituacao(s);
    });
    return () => {
      vivo = false;
    };
  }, []);

  async function escolher() {
    try {
      await escolherImpressoraSerial();
      aoAvisar({ ok: "Impressora escolhida. Faça o teste de impressão." });
    } catch (falha) {
      aoAvisar({ erro: falha instanceof ErroDaImpressora ? falha.message : "Não foi possível escolher." });
    }
    await verificar();
  }

  async function esquecer() {
    await esquecerImpressoraSerial();
    aoAvisar({ ok: "Este aparelho esqueceu a impressora." });
    await verificar();
  }

  if (situacao === "sem-suporte") {
    return (
      <p role="alert" className="m-0 rounded-12 border border-twb bg-tw px-3 py-[10px] text-[13px] font-semibold text-twf">
        Este navegador não fala com impressora Bluetooth. Use o Google Chrome atualizado — no Android, no
        Windows ou no Mac. No iPhone não funciona.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-12 border border-border-shalon bg-elev p-3">
      <div>
        <p className="m-0 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Impressora Bluetooth</p>
        <p className="m-0 mt-1 text-[13.5px] text-ink" role="status">
          {situacao === "verificando"
            ? "Verificando…"
            : situacao === "escolhida"
              ? "Escolhida neste aparelho. Imprimir não pergunta mais nada."
              : "Nenhuma escolhida ainda. Pareie a impressora no Bluetooth do aparelho e depois escolha aqui."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" variante="secundario" onClick={escolher} disabled={situacao === "verificando"}>
            {situacao === "escolhida" ? "Trocar impressora" : "Escolher impressora"}
          </Button>
          {situacao === "escolhida" ? (
            <Button type="button" variante="fantasma" onClick={esquecer}>
              Esquecer
            </Button>
          ) : null}
        </div>
      </div>

      <Opcoes
        rotulo="Acentos"
        opcoes={TABELAS}
        atual={impressora.tabela}
        aoEscolher={(tabela) => aoSalvar({ ...impressora, tabela })}
      />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input, SelectMenu } from "@/ui/components";
import { Aviso, Cartao, ParDeDados } from "@/ui/patterns";
import { COLUNAS, type Papel } from "@/domain/pedidos/comanda";
import {
  ESPACO_FINAL_MM,
  MARGEM_ESQUERDA_MM,
  podeSerBalcao,
  salvarImpressoraDoAparelho,
  useImpressoraDoAparelho,
  type EspacoFinal,
  type MargemEsquerda,
  areaValida,
  type ImpressoraDoAparelho,
  type ModoDeImpressao,
  LETRAS_POR_LINHA,
} from "@/ui/impressao/impressoraDoAparelho";
import { imprimirReguaDeAlinhamento, linhasDeTeste } from "@/ui/impressao/imprimir";
import { colunasDoAparelho, imprimirNoAparelho } from "@/ui/impressao/imprimirNoAparelho";
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

/** O que a pessoa escolhe: cada opção é um modo e, no direto, a língua da impressora. */
type Caminho = ModoDeImpressao | "diebold";

function caminhoDe(i: ImpressoraDoAparelho): Caminho {
  return i.modo === "serial" && i.comandos === "diebold" ? "diebold" : i.modo;
}

const MODOS: { valor: Caminho; titulo: string; detalhe: string }[] = [
  {
    valor: "diebold",
    titulo: "Diebold pela porta USB",
    detalhe:
      "Fala direto com a Diebold IM433, sem janela e sem driver, na largura exata da impressão. A porta é escolhida uma vez, aqui.",
  },
  {
    valor: "serial",
    titulo: "Bluetooth direto",
    detalhe:
      "Fala direto com a impressora Bluetooth, como a de 58 mm, sem RawBT. A impressora é escolhida uma vez, aqui.",
  },
  {
    valor: "sistema",
    titulo: "Pela impressora do Windows",
    detalhe: "Manda para a impressora padrão deste aparelho. Precisa do atalho do Chrome para não abrir janela.",
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
  { valor: "nenhuma", titulo: "Nenhuma", detalhe: "O documento ocupa toda a área da impressora." },
  {
    valor: "pequena",
    titulo: "Pequena",
    detalhe: `${MARGEM_ESQUERDA_MM.pequena} mm de cada lado. Se o começo ou o fim das linhas sai cortado.`,
  },
  { valor: "media", titulo: "Média", detalhe: `${MARGEM_ESQUERDA_MM.media} mm de cada lado. Se com a pequena ainda corta.` },
  { valor: "grande", titulo: "Grande", detalhe: `${MARGEM_ESQUERDA_MM.grande} mm de cada lado. Se com a média ainda corta.` },
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
  // Lista suspensa para a aba não virar uma parede de cartões; o detalhe da
  // opção escolhida fica embaixo, e o de cada uma aparece na lista aberta.
  const escolhida = opcoes.find((opcao) => opcao.valor === atual);
  return (
    <SelectMenu
      label={rotulo}
      valor={atual}
      aoMudar={(valor) => aoEscolher(valor as T)}
      {...(escolhida ? { hint: escolhida.detalhe } : {})}
      opcoes={opcoes.map((opcao) => ({ valor: opcao.valor, texto: opcao.titulo, descricao: opcao.detalhe }))}
    />
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
      // Mesmo caminho e mesmas colunas da comanda e dos cupons deste aparelho.
      await imprimirNoAparelho(linhasDeTeste(impressora.papel, colunasDoAparelho(impressora)), impressora);
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

  const caminho = caminhoDe(impressora);
  const ehDiebold = caminho === "diebold";
  const pelaTela = impressora.modo === "sistema" || impressora.modo === "tela";
  // A Diebold já garante o avanço até a guilhotina; o resto depende do aparelho.
  const temEspaco = impressora.modo !== "balcao" && !ehDiebold;
  const temAjustes = impressora.modo !== "balcao";

  function escolherCaminho(novo: Caminho) {
    if (novo === "diebold") {
      salvar({ ...impressora, modo: "serial", comandos: "diebold", papel: "80", letrasPorLinha: "auto" });
      return;
    }
    salvar({ ...impressora, modo: novo, comandos: "escpos" });
  }

  return (
    <div className="flex flex-col gap-4">
      <Cartao
        titulo="Impressora deste aparelho"
        descricao="Vale só para este computador ou celular. Cada aparelho guarda a sua — mudar aqui não muda nos outros."
      >
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Opcoes rotulo="Como imprimir" opcoes={MODOS} atual={caminho} aoEscolher={escolherCaminho} />
            {ehDiebold ? (
              <ParDeDados chave="Papel" valor="80 mm" />
            ) : (
              <Opcoes
                rotulo="Papel"
                opcoes={PAPEIS}
                atual={impressora.papel}
                aoEscolher={(papel) => salvar({ ...impressora, papel, letrasPorLinha: "auto" })}
              />
            )}
          </div>

          {impressora.modo === "serial" ? (
            <ImpressoraDireta impressora={impressora} aoSalvar={salvar} aoAvisar={setAviso} />
          ) : null}

          <Aviso {...aviso} />

          <div>
            <Button type="button" disabled={imprimindo} onClick={testar}>
              {imprimindo ? "Enviando…" : "Teste de impressão"}
            </Button>
          </div>

          <div>
            <ParDeDados chave="Documento" valor="Comanda não fiscal" />
            <ParDeDados chave="Reimpressão" valor="Fica registrada, com autor e horário" />
            <ParDeDados chave="Cupons do PDV e fechamento de caixa" valor={`Saem em ${impressora.papel} mm`} />
          </div>
        </div>
      </Cartao>

      {podeSerBalcao(impressora) ? (
        <Cartao titulo="Balcão" descricao="Para os celulares imprimirem nesta impressora.">
          <div className="flex flex-col gap-3">
            <Opcoes
              rotulo="Imprimir também o que os celulares pedirem?"
              opcoes={ESTACAO}
              atual={impressora.estacao ? "sim" : "nao"}
              aoEscolher={(v) => salvar({ ...impressora, estacao: v === "sim" })}
            />
            {impressora.estacao && impressora.modo === "sistema" ? (
              <p className="m-0 rounded-12 border border-tib bg-ti px-3 py-[10px] text-[13px] font-semibold text-tif">
                Deixe o Chrome aberto pelo atalho do balcão. Sem ele, cada pedido dos celulares abre a janela de
                impressão e fica parado esperando alguém clicar.
              </p>
            ) : null}
          </div>
        </Cartao>
      ) : null}

      {temAjustes ? (
        <Recolhivel
          titulo="Ajustes do papel"
          detalhe={
            ehDiebold
              ? "Só se quiser mudar o tamanho da letra."
              : "Espaço no fim, letras por linha, margens e régua. Só mexa se o teste sair errado."
          }
        >
          <div className="flex flex-col gap-4">
            {temEspaco ? (
              <Opcoes
                rotulo="Espaço no fim do papel"
                opcoes={ESPACOS}
                atual={impressora.espacoFinal}
                aoEscolher={(espacoFinal) => salvar({ ...impressora, espacoFinal })}
              />
            ) : null}
            <SelectMenu
              label="Letras por linha"
              valor={impressora.letrasPorLinha}
              aoMudar={(letrasPorLinha) => salvar({ ...impressora, letrasPorLinha })}
              hint={
                ehDiebold
                  ? "Menos letras por linha deixam a letra maior."
                  : "Se o fim das linhas sai cortado (ex.: R$ 57,0 em vez de 57,00), imprima o teste e escolha o maior número da régua que sai inteiro."
              }
              opcoes={[
                { valor: "auto", texto: "Automático", descricao: "O padrão do papel (ou o da régua, se calibrou)." },
                ...LETRAS_POR_LINHA[impressora.papel].map((n) => ({ valor: String(n), texto: `${n} letras` })),
              ]}
            />
            {pelaTela && impressora.areaMedida === null ? (
              <Opcoes
                rotulo="Margem nas laterais"
                opcoes={MARGENS}
                atual={impressora.margemEsquerda}
                aoEscolher={(margemEsquerda) => salvar({ ...impressora, margemEsquerda })}
              />
            ) : null}
            {pelaTela ? <CalibrarComRegua impressora={impressora} aoSalvar={salvar} aoAvisar={setAviso} /> : null}
          </div>
        </Recolhivel>
      ) : null}

      {impressora.modo === "sistema" ? (
        <Recolhivel
          titulo="Imprimir sem a janela de escolha"
          detalhe="Passo a passo do atalho do Chrome, e o que fazer se a janela ainda abrir."
        >
          <div className="flex flex-col gap-4">
            <ConfigurarImpressaoDireta atalhoChrome={ATALHO_CHROME} copiado={copiado} aoCopiar={copiarAtalho} />
            <GuiaDaJanelaDeImpressao />
          </div>
        </Recolhivel>
      ) : null}
    </div>
  );
}

/** Bloco que fica fechado até alguém precisar: a aba mostra primeiro o que importa. */
function Recolhivel({
  titulo,
  detalhe,
  children,
}: {
  titulo: string;
  detalhe: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-12 border border-border-shalon bg-surface open:border-brand-orange">
      <summary className="flex min-h-touch cursor-pointer list-none items-center gap-3 rounded-12 px-4 py-3 marker:hidden hover:bg-elev [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-bold text-ink">{titulo}</span>
          <span className="block text-[12.5px] text-muted">{detalhe}</span>
        </span>
        <span aria-hidden="true" className="text-muted group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="border-t border-border-shalon p-4">{children}</div>
    </details>
  );
}


async function situacaoDoBluetooth(): Promise<"sem-suporte" | "nenhuma" | "escolhida"> {
  if (!serialDisponivel()) return "sem-suporte";
  return (await impressoraLembrada()) === null ? "nenhuma" : "escolhida";
}

/**
 * A impressora direta deste aparelho, Bluetooth ou porta USB da Diebold:
 * escolher (uma vez), trocar, esquecer e, no Bluetooth, a tabela de acentos.
 */
function ImpressoraDireta({
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

  const ehDiebold = impressora.comandos === "diebold";

  if (situacao === "sem-suporte") {
    return (
      <p role="alert" className="m-0 rounded-12 border border-twb bg-tw px-3 py-[10px] text-[13px] font-semibold text-twf">
        {ehDiebold
          ? "Este navegador não fala com a porta USB. Use o Google Chrome ou o Edge atualizado, no Windows."
          : "Este navegador não fala com impressora Bluetooth. Use o Google Chrome atualizado — no Android, no Windows ou no Mac. No iPhone não funciona."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-12 border border-border-shalon bg-elev p-3">
      <div>
        <p className="m-0 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">
          {ehDiebold ? "Porta da Diebold" : "Impressora Bluetooth"}
        </p>
        <p className="m-0 mt-1 text-[13.5px] text-ink" role="status">
          {situacao === "verificando"
            ? "Verificando…"
            : situacao === "escolhida"
              ? "Escolhida neste aparelho. Imprimir não pergunta mais nada."
              : ehDiebold
                ? "Nenhuma escolhida ainda. Clique abaixo e escolha a porta COM da impressora, a mesma que aparece no Gerenciador de Dispositivos."
                : "Nenhuma escolhida ainda. Pareie a impressora no Bluetooth do aparelho e depois escolha aqui."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" variante="secundario" onClick={escolher} disabled={situacao === "verificando"}>
            {situacao !== "escolhida" ? (ehDiebold ? "Escolher porta" : "Escolher impressora") : ehDiebold ? "Trocar porta" : "Trocar impressora"}
          </Button>
          {situacao === "escolhida" ? (
            <Button type="button" variante="fantasma" onClick={esquecer}>
              Esquecer
            </Button>
          ) : null}
        </div>
      </div>

      {ehDiebold ? null : (
        <Opcoes
          rotulo="Acentos"
          opcoes={TABELAS}
          atual={impressora.tabela}
          aoEscolher={(tabela) => aoSalvar({ ...impressora, tabela })}
        />
      )}
    </div>
  );
}

/**
 * Calibração pela régua de alinhamento (13/10/2026): em vez de adivinhar a
 * margem, imprime-se uma régua de borda a borda e digita-se onde a
 * impressora começa e termina. Todo documento passa a ser desenhado
 * exatamente nessa faixa.
 */
function CalibrarComRegua({
  impressora,
  aoSalvar,
  aoAvisar,
}: {
  impressora: ImpressoraDoAparelho;
  aoSalvar: (nova: ImpressoraDoAparelho) => void;
  aoAvisar: (aviso: { erro?: string; ok?: string }) => void;
}) {
  const atual = impressora.areaMedida;
  const [inicio, setInicio] = useState(atual ? String(atual.inicioMm) : "");
  const [fim, setFim] = useState(atual ? String(atual.fimMm) : "");
  const [imprimindo, setImprimindo] = useState(false);

  async function imprimirRegua() {
    aoAvisar({});
    setImprimindo(true);
    try {
      await imprimirReguaDeAlinhamento(impressora.papel);
      aoAvisar({ ok: "Régua enviada. Anote o primeiro e o último número que saíram no papel." });
    } catch {
      aoAvisar({ erro: "O navegador não conseguiu enviar a régua para a impressora." });
    } finally {
      setImprimindo(false);
    }
  }

  function salvarArea() {
    const area = {
      inicioMm: Number(inicio.replace(",", ".")),
      fimMm: Number(fim.replace(",", ".")),
    };
    if (!areaValida(area, impressora.papel)) {
      aoAvisar({
        erro: `Confira os números: o início vem antes do fim, os dois ficam entre 0 e ${impressora.papel} mm, e a área tem pelo menos 30 mm.`,
      });
      return;
    }
    aoSalvar({ ...impressora, areaMedida: area });
  }

  function voltarAoAutomatico() {
    setInicio("");
    setFim("");
    aoSalvar({ ...impressora, areaMedida: null });
  }

  return (
    <div className="flex flex-col gap-3 rounded-12 border border-border-shalon bg-elev p-3">
      <div>
        <p className="m-0 text-[12px] font-bold uppercase tracking-[0.06em] text-muted">Calibrar com a régua</p>
        <p className="m-0 mt-1 text-[13px] text-ink-2">
          {atual
            ? `Usando a área medida: de ${atual.inicioMm} a ${atual.fimMm} mm. A margem nas laterais fica desligada.`
            : "Se o começo ou o fim das linhas sai cortado mesmo com margem, imprima a régua e digite onde a impressão começa e termina."}
        </p>
      </div>
      <div>
        <Button type="button" variante="secundario" disabled={imprimindo} onClick={imprimirRegua}>
          {imprimindo ? "Enviando…" : "Imprimir régua de alinhamento"}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="A impressão começa em (mm)"
          inputMode="decimal"
          placeholder="Ex.: 4"
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
        />
        <Input
          label="A impressão termina em (mm)"
          inputMode="decimal"
          placeholder="Ex.: 70"
          value={fim}
          onChange={(e) => setFim(e.target.value)}
        />
      </div>
      <p className="m-0 text-[12.5px] text-muted">
        Para não pegar bem no limite, digite 1 mm para dentro do que a régua mostrou (começo +1, fim −1). A
        faixa preta da régua saindo falhada ou com riscos brancos indica cabeçote sujo ou com defeito: limpe
        com álcool isopropílico e cotonete, com a impressora desligada.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={salvarArea} disabled={inicio.trim() === "" || fim.trim() === ""}>
          Usar esta área
        </Button>
        {atual ? (
          <Button type="button" variante="fantasma" onClick={voltarAoAutomatico}>
            Voltar à margem automática
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Diagnóstico de "ainda abre uma janela ao imprimir" (17/10/2026).
 *
 * Organizado por SINTOMA: a pessoa olha a janela que apareceu, abre só o caso
 * dela e segue os passos. Cada caso diz como reconhecer, a causa e o que
 * fazer, nessa ordem. Tudo é feito no computador que imprime.
 */
function GuiaDaJanelaDeImpressao() {
  const codigo = "rounded-6 bg-elev px-1.5 py-0.5 font-mono text-[12.5px] text-ink";
  const casos: {
    id: string;
    titulo: string;
    reconhecer: string;
    causa: React.ReactNode;
    passos: React.ReactNode[];
  }[] = [
    {
      id: "cinza",
      titulo: "Tela cinza do Chrome, com “Destino” e botão Imprimir",
      reconhecer: "É a prévia de impressão do próprio Chrome.",
      causa: (
        <>
          O Chrome não foi aberto com <code className={codigo}>--kiosk-printing</code>.
        </>
      ),
      passos: [
        <>
          Abra <code className={codigo}>chrome://version</code> e veja a linha <strong>Linha de comando</strong>.
        </>,
        <>
          Se <code className={codigo}>--kiosk-printing</code> não aparece: o Chrome foi aberto por outro atalho (barra
          de tarefas, Menu Iniciar) ou já estava aberto. Edite o atalho que vocês realmente clicam.
        </>,
        <>Feche todas as janelas do Chrome (confira o ícone perto do relógio) e abra pelo atalho editado.</>,
      ],
    },
    {
      id: "salvar",
      titulo: "Janela “Salvar como”, pedindo nome de arquivo",
      reconhecer: "Pede uma pasta e um nome, como quando se salva um documento.",
      causa: (
        <>
          A impressão direta está ligada, mas o Chrome está mandando para <strong>Salvar como PDF</strong>. Ele usa
          a última impressora escolhida dentro dele.
        </>
      ),
      passos: [
        <>Abra o Chrome do jeito normal (sem o atalho do balcão).</>,
        <>
          Imprima qualquer página uma vez e, em <strong>Destino</strong>, escolha a impressora de 80 mm.
        </>,
        <>Feche todas as janelas do Chrome e abra de novo pelo atalho do balcão.</>,
      ],
    },
    {
      id: "windows",
      titulo: "Janela do Windows, com a lista de impressoras do sistema",
      reconhecer: "É a janela “Imprimir” do Windows, não a do Chrome.",
      causa: (
        <>
          O Chrome deste computador está configurado para não usar a própria tela de impressão. Com isso, ele sempre
          manda para a janela do Windows e ignora a impressão direta.
        </>
      ),
      passos: [
        <>
          Em <code className={codigo}>chrome://version</code>, veja se a <strong>Linha de comando</strong> também tem{" "}
          <code className={codigo}>--disable-print-preview</code>. Se tiver, tire esse trecho do campo{" "}
          <strong>Destino</strong> do atalho (botão direito → Propriedades) e deixe só o{" "}
          <code className={codigo}>--kiosk-printing</code>.
        </>,
        <>
          Abra <code className={codigo}>chrome://policy</code> e procure <strong>DisablePrintPreview</strong>. Se não
          aparecer, pule para o último passo.
        </>,
        <>
          Se aparecer: aperte <strong>Windows + R</strong>, digite <code className={codigo}>regedit</code> e Enter.
          Vá até <code className={codigo}>HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome</code> e apague o
          valor <strong>DisablePrintPreview</strong>. Faça o mesmo em{" "}
          <code className={codigo}>HKEY_CURRENT_USER\SOFTWARE\Policies\Google\Chrome</code>, se existir.
        </>,
        <>
          Feche todas as janelas do Chrome e abra pelo atalho. Em <code className={codigo}>chrome://policy</code>, a{" "}
          DisablePrintPreview não deve mais aparecer. Faça o teste de impressão.
        </>,
        <>
          Se nenhuma das duas aparecia e a janela continua: anote a <strong>marca e o modelo</strong> da impressora e{" "}
          <strong>como ela está ligada</strong> (USB, rede ou Bluetooth) e chame o suporte — algumas impressoras
          térmicas imprimem direto, sem passar pela janela do navegador.
        </>,
      ],
    },
  ];

  return (
    <Cartao
      titulo="Ainda abre uma janela ao imprimir?"
      descricao="Faça no computador que imprime. Olhe a janela que apareceu, abra só o caso dela e siga os passos na ordem."
    >
      <div className="flex flex-col gap-2">
        {casos.map((c, indice) => (
          <details key={c.id} className="group rounded-12 border border-border-shalon bg-surface open:border-brand-orange">
            <summary className="flex min-h-touch cursor-pointer list-none items-center gap-3 rounded-12 px-3 py-2.5 marker:hidden hover:bg-elev [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-elev text-[13px] font-bold text-ink group-open:bg-cta group-open:text-cta-fg"
              >
                {String.fromCharCode(65 + indice)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-ink">{c.titulo}</span>
                <span className="block text-[12.5px] text-muted">{c.reconhecer}</span>
              </span>
              <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">
                ⌄
              </span>
            </summary>
            <div className="border-t border-border-shalon px-3 pb-3 pt-2.5 text-[13.5px] text-ink">
              <p className="m-0 rounded-10 bg-tw px-3 py-2 text-[13px] text-twf">
                <strong>Causa:</strong> {c.causa}
              </p>
              <p className="m-0 mt-3 text-[12px] font-bold uppercase tracking-[0.05em] text-muted">O que fazer</p>
              <ol className="m-0 mt-1.5 flex list-decimal flex-col gap-2 pl-5">
                {c.passos.map((passo, i) => (
                  <li key={i}>{passo}</li>
                ))}
              </ol>
            </div>
          </details>
        ))}
      </div>
    </Cartao>
  );
}

/**
 * Passo a passo da impressão direta no Windows, em 4 etapas (17/10/2026).
 *
 * Antes era uma lista corrida de 6 itens com subitens. Agora cada etapa tem
 * um título que diz o objetivo e poucos passos; o atalho, que depende de como
 * o sistema é aberto, vira duas opções e a pessoa abre só a dela.
 */
function ConfigurarImpressaoDireta({
  atalhoChrome,
  copiado,
  aoCopiar,
}: {
  atalhoChrome: string;
  copiado: boolean;
  aoCopiar: () => void;
}) {
  const codigo = "rounded-6 bg-elev px-1.5 py-0.5 font-mono text-[12.5px] text-ink";

  const etapas: { titulo: string; objetivo: string; conteudo: React.ReactNode }[] = [
    {
      titulo: "Impressora no Windows",
      objetivo: "O Windows precisa saber qual é a impressora do balcão.",
      conteudo: (
        <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5">
          <li>Instale o driver da impressora térmica.</li>
          <li>
            Em <strong>Configurações → Bluetooth e dispositivos → Impressoras e scanners</strong>, desligue{" "}
            <em>&quot;Permitir que o Windows gerencie minha impressora padrão&quot;</em> e defina a térmica como{" "}
            <strong>padrão</strong>.
          </li>
          <li>
            Nas preferências da impressora, confira que o papel é o <strong>rolo certo</strong> (58 ou 80 mm).
          </li>
        </ol>
      ),
    },
    {
      titulo: "Chrome sem rodar escondido",
      objetivo: "Se o Chrome fica aberto em segundo plano, o atalho do balcão é ignorado.",
      conteudo: (
        <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5">
          <li>
            Abra <code className={codigo}>chrome://settings/system</code>.
          </li>
          <li>
            Desligue <strong>&quot;Continuar executando apps em segundo plano quando o Google Chrome for fechado&quot;</strong>.
          </li>
        </ol>
      ),
    },
    {
      titulo: "Atalho do balcão",
      objetivo: (
        "Acrescentar --kiosk-printing ao atalho que vocês clicam para abrir o sistema. Abra só a opção que usam."
      ),
      conteudo: (
        <div className="flex flex-col gap-2">
          <details className="group rounded-12 border border-border-shalon bg-surface open:border-brand-orange">
            <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 rounded-12 px-3 text-[13.5px] font-semibold text-ink marker:hidden hover:bg-elev [&::-webkit-details-marker]:hidden">
              Sistema instalado como app (ícone da Shalon)
              <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <ol className="m-0 flex list-decimal flex-col gap-1.5 border-t border-border-shalon px-3 pb-3 pt-2.5 pl-8">
              <li>
                Botão direito no ícone do app (Área de Trabalho e Menu Iniciar) → <strong>Propriedades</strong>.
              </li>
              <li>
                No campo <strong>Destino</strong>, depois de <code className={codigo}>--app-id=…</code>, acrescente um
                espaço e <code className={codigo}>--kiosk-printing</code>. Clique em OK.
              </li>
              <li>Se o app estiver fixado na barra de tarefas, desafixe e fixe de novo a partir do atalho editado.</li>
            </ol>
          </details>
          <details className="group rounded-12 border border-border-shalon bg-surface open:border-brand-orange">
            <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 rounded-12 px-3 text-[13.5px] font-semibold text-ink marker:hidden hover:bg-elev [&::-webkit-details-marker]:hidden">
              Pelo Chrome comum
              <span aria-hidden="true" className="text-muted transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <div className="border-t border-border-shalon px-3 pb-3 pt-2.5">
              <p className="m-0">
                Botão direito no atalho do Chrome → <strong>Propriedades</strong>, e deixe o campo{" "}
                <strong>Destino</strong> assim:
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="min-w-0 break-all rounded-10 bg-elev px-3 py-2 font-mono text-[12px] text-ink">
                  {atalhoChrome}
                </code>
                <Button type="button" variante="fantasma" tamanho="sm" onClick={aoCopiar}>
                  {copiado ? "Copiado" : "Copiar"}
                </Button>
              </div>
              <p className="m-0 mt-2 text-[12.5px] text-muted">
                No Edge é igual, com <code className={codigo}>msedge.exe --kiosk-printing</code>.
              </p>
            </div>
          </details>
        </div>
      ),
    },
    {
      titulo: "Testar",
      objetivo: "O Chrome só lê o atalho quando abre do zero.",
      conteudo: (
        <ol className="m-0 flex list-decimal flex-col gap-1.5 pl-5">
          <li>
            Feche <strong>todas</strong> as janelas do Chrome e do app — confira também o ícone perto do relógio.
          </li>
          <li>Abra pelo atalho editado.</li>
          <li>
            Aqui nesta aba, escolha o papel e <strong>&quot;Imprimir direto&quot;</strong>, e clique em{" "}
            <strong>Teste de impressão</strong>.
          </li>
          <li>
            Saiu sem perguntar? Pronto. Abriu alguma janela? Use o guia <strong>&quot;Ainda abre uma janela ao
            imprimir?&quot;</strong> logo abaixo.
          </li>
        </ol>
      ),
    },
  ];

  return (
    <Cartao
      titulo="Imprimir sem a janela de escolha (Windows)"
      descricao="Faça uma vez só, no computador que imprime. Depois, o sistema manda a comanda direto para a impressora."
    >
      <ol className="m-0 flex list-none flex-col p-0">
        {etapas.map((etapa, i) => (
          <li key={etapa.titulo} className="relative flex gap-3 pb-5 last:pb-0">
            {/* Linha que liga as etapas, para ler como um caminho. */}
            {i < etapas.length - 1 ? (
              <span aria-hidden="true" className="absolute bottom-0 left-[13px] top-8 w-px bg-border-shalon" />
            ) : null}
            <span
              aria-hidden="true"
              className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-cta text-[13px] font-bold text-cta-fg"
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 pt-0.5 text-[13.5px] text-ink">
              <p className="m-0 text-[14.5px] font-bold text-ink">{etapa.titulo}</p>
              <p className="m-0 mb-2 text-[12.5px] text-muted">{etapa.objetivo}</p>
              {etapa.conteudo}
            </div>
          </li>
        ))}
      </ol>
    </Cartao>
  );
}

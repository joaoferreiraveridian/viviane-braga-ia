import { Bot, FileText, Image as ImageIcon, Mic, MessageSquare, Paperclip, User, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Formata um valor monetário na própria moeda informada — nunca converte,
 * nunca soma moedas diferentes. Se o código de moeda vier fora do padrão
 * ISO 4217 que o Intl reconhece, mostra o valor bruto com o código ao lado
 * em vez de quebrar ou esconder o número.
 */
export function formatMoeda(valor: number, moeda: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(valor);
  } catch {
    return `${valor.toLocaleString("pt-BR")} ${moeda}`;
  }
}

interface InfoTipoConteudo {
  label: string;
  Icon: LucideIcon;
}

// Só os quatro tipos citados na tarefa. Qualquer outro valor que a ingestão
// vier a produzir cai no fallback de infoTipoConteudo — nunca quebra, nunca
// inventa um rótulo diferente do valor real da coluna.
const TIPOS_CONTEUDO_CONHECIDOS: Record<string, InfoTipoConteudo> = {
  texto: { label: "Texto", Icon: MessageSquare },
  imagem: { label: "Imagem", Icon: ImageIcon },
  video: { label: "Vídeo", Icon: Video },
  audio: { label: "Áudio", Icon: Mic },
  documento: { label: "Documento", Icon: FileText },
};

export function infoTipoConteudo(tipo: string | null): InfoTipoConteudo {
  if (!tipo) return { label: "Conteúdo", Icon: Paperclip };
  return TIPOS_CONTEUDO_CONHECIDOS[tipo] ?? { label: capitalizar(tipo), Icon: Paperclip };
}

/**
 * Formata um telefone E.164 (`+5521959528957`) para leitura, quando dá para
 * reconhecer o padrão de celular brasileiro (+55, DDD de 2 dígitos, 9 dígitos
 * de número). Fora desse padrão — outro país, formato inesperado — devolve o
 * valor E.164 como veio: nunca inventa separador para um formato que não
 * reconhece. A base hoje é PT/ES/EN (ver CLAUDE.md), então números fora do
 * Brasil são esperados e não devem quebrar nem exibir algo incorreto.
 */
export function formatarTelefone(e164: string): string {
  const match = /^\+55(\d{2})(\d{5})(\d{4})$/.exec(e164);
  if (!match) return e164;
  const [, ddd, prefixo, sufixo] = match;
  return `+55 (${ddd}) ${prefixo}-${sufixo}`;
}

/** Tipo de identidade usado por `api.vw_pessoa_resumo.identidades` para telefone E.164. */
export const TIPO_IDENTIDADE_TELEFONE = "telefone_e164";

/**
 * Extrai o telefone E.164 de uma lista de identidades da pessoa — mesma
 * chave (`telefone_e164`) usada tanto pela busca em lote da lista de
 * conversas (`use-inbox.ts`) quanto pelo painel da pessoa. Único lugar que
 * conhece esse nome de tipo; `null` quando não há identidade de telefone.
 */
export function extrairTelefone(
  identidades: Array<{ tipo: string; valor: string }> | null | undefined,
): string | null {
  return identidades?.find((i) => i.tipo === TIPO_IDENTIDADE_TELEFONE)?.valor ?? null;
}

export type TipoIdentidadeResolvida = "nome" | "telefone" | "generico";

export interface IdentidadeResolvida {
  texto: string;
  tipo: TipoIdentidadeResolvida;
}

/**
 * Cadeia única de resolução de identidade de uma pessoa em toda a tela do
 * Inbox: nome cadastrado → telefone formatado → rótulo genérico. Usada pela
 * linha da lista, pelo cabeçalho da conversa aberta e pelo título do painel
 * da pessoa — nunca reescrita localmente em nenhum dos três, para que as
 * três superfícies nunca divirjam sobre o que mostrar quando o nome está
 * nulo (a reclamação original do CTO). `tipo` diz ao chamador como estilizar
 * o texto: "nome" pode usar a serifada; "telefone" é número — nunca serifada,
 * sempre `.tabular`; "generico" é o rótulo de fallback, sem ênfase.
 */
export function resolverIdentidadePessoa(nome: string | null, telefone: string | null): IdentidadeResolvida {
  if (nome) return { texto: nome, tipo: "nome" };
  if (telefone) return { texto: formatarTelefone(telefone), tipo: "telefone" };
  return { texto: "Contato sem pessoa vinculada", tipo: "generico" };
}

export function capitalizar(valor: string): string {
  if (!valor) return valor;
  return valor.charAt(0).toUpperCase() + valor.slice(1);
}

/**
 * Tempo decorrido a partir de um timestamp ISO, mesmo formato do
 * RecencyBadge ("há Xh", "há X dias"...). Usado para o destaque de
 * "sem resposta há X" a partir de `semRespostaDesde` — deliberadamente NÃO
 * usa a coluna `tempo_sem_resposta` (tipo `interval` do Postgres), cuja
 * serialização em texto depende do IntervalStyle do banco e não é estável
 * o bastante para parsear no cliente. `sem_resposta_desde` é um
 * timestamptz confirmado por SELECT, sem essa ambiguidade.
 */
export function tempoDecorrido(dataISO: string, agora: Date = new Date()): string {
  const diffMs = agora.getTime() - new Date(dataISO).getTime();
  const diffMin = Math.max(0, Math.round(diffMs / 60_000));

  if (diffMin < 1) return "agora mesmo";
  if (diffMin < 60) return `${diffMin} min`;

  const diffHoras = Math.round(diffMin / 60);
  if (diffHoras < 24) return `${diffHoras}h`;

  const diffDias = Math.round(diffHoras / 24);
  if (diffDias === 1) return "1 dia";
  return `${diffDias} dias`;
}

/** Chave estável de dia local (ano-mês-dia), para agrupar mensagens por dia no thread. */
export function chaveDia(dataISO: string): string {
  const data = new Date(dataISO);
  return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;
}

/**
 * Rótulo do separador de data no thread: "Hoje", "Ontem", dia da semana
 * (últimos 7 dias) ou data completa — mesmo critério do CRM legado
 * (`DateSeparator`), sem depender de `date-fns` (não instalado nesta
 * plataforma): só `Intl`/`Date` nativos.
 */
export function descricaoDia(dataISO: string, agora: Date = new Date()): string {
  const data = new Date(dataISO);
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const diaMensagem = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const diffDias = Math.round((hoje.getTime() - diaMensagem.getTime()) / 86_400_000);

  if (diffDias === 0) return "Hoje";
  if (diffDias === 1) return "Ontem";
  if (diffDias > 1 && diffDias < 7) {
    const rotulo = data.toLocaleDateString("pt-BR", { weekday: "long" });
    return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
  }
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Hora curta (HH:mm) de uma mensagem dentro do thread — sem a data, que já está no separador do dia. */
export function horaCurta(dataISO: string): string {
  return new Date(dataISO).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Horário da última mensagem para a linha da lista de conversas — mesmo
 * critério do WhatsApp (e do CRM legado, `formatLastMessageTime`): hoje
 * mostra só a hora (`HH:mm`), ontem mostra "Ontem", dentro dos últimos 7 dias
 * mostra o dia da semana abreviado, mais antigo que isso mostra a data curta.
 * Deliberadamente diferente de `descricaoDia` (que sempre escreve o dia por
 * extenso, para o separador dentro do thread) — aqui o espaço é de canto de
 * linha, então o texto tem que ser o mais curto possível.
 */
export function formatarHoraLista(dataISO: string, agora: Date = new Date()): string {
  const data = new Date(dataISO);
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const diaMensagem = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const diffDias = Math.round((hoje.getTime() - diaMensagem.getTime()) / 86_400_000);

  if (diffDias <= 0) return horaCurta(dataISO);
  if (diffDias === 1) return "Ontem";
  if (diffDias > 1 && diffDias < 7) {
    const rotulo = data.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
    return capitalizar(rotulo);
  }
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export type TipoOrigemMensagem = "lead" | "humano" | "ia" | "desconhecido";

export interface InfoOrigemMensagem {
  tipo: TipoOrigemMensagem;
  /** Rótulo curto para prefixar a prévia da lista ("Você", "IA") — `null` quando não deve haver prefixo (mensagem recebida do contato, ou remetente que a ingestão ainda não classificou). */
  rotulo: string | null;
  /** `null` quando não há ícone de origem a mostrar (mensagem recebida do contato). */
  Icon: LucideIcon | null;
}

// Valores reais confirmados por SELECT via MCP em `core.mensagem_whatsapp`/
// `api.vw_inbox_conversas` em 30/07/2026 — só `lead`, `agente`, `bot` existem
// hoje (nenhuma linha com `agente_crm`, citado como possível pelo CRM legado).
// Comentário oficial da coluna (`core.mensagem_whatsapp.remetente`): "lead =
// contato; bot = agente de IA; agente = humano respondendo manualmente." As
// três origens nunca são achatadas em "recebido/enviado" — é exatamente a
// distinção que o CTO pediu para aparecer dentro da conversa.
const ORIGEM_POR_REMETENTE: Record<string, InfoOrigemMensagem> = {
  lead: { tipo: "lead", rotulo: null, Icon: null },
  agente: { tipo: "humano", rotulo: "Você", Icon: User },
  bot: { tipo: "ia", rotulo: "IA", Icon: Bot },
};

/**
 * Resolve o remetente real da coluna `remetente` (`core.mensagem_whatsapp` /
 * `ultima_mensagem_remetente` da view de conversas) para um ícone e um
 * rótulo curto. Usado tanto pela prévia da lista quanto pelo ícone dentro de
 * cada bolha do thread — um único lugar que conhece o mapeamento, para as
 * duas superfícies nunca divergirem sobre o que "bot" ou "agente" significam.
 * Remetente fora do conjunto conhecido (ou nulo) cai em "desconhecido": sem
 * ícone, sem rótulo — nunca inventa uma origem que o dado não confirma.
 */
export function infoOrigemMensagem(remetente: string | null): InfoOrigemMensagem {
  if (!remetente) return { tipo: "desconhecido", rotulo: null, Icon: null };
  return ORIGEM_POR_REMETENTE[remetente] ?? { tipo: "desconhecido", rotulo: null, Icon: null };
}

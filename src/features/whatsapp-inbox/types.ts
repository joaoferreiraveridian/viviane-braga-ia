export interface Conversa {
  id: string;
  instanciaId: string;
  contatoTelefone: string;
  contatoNome: string | null;
  ultimaMensagemConteudo: string | null;
  ultimaMensagemEm: string | null;
  /** remetente (agente/contato/bot) da última mensagem — usado só pra mostrar o tiquinho de status na lista quando fomos nós. */
  ultimaMensagemRemetente: RemetenteMensagem | null;
  /** status_entrega da última mensagem — alimenta o tiquinho (enviado/entregue/lido) na lista. */
  ultimaMensagemStatus: string | null;
  naoLidas: number;
  /** quando a conversa foi aberta pela última vez na UI — usado só pra decidir se zera nao_lidas, não precisa aparecer na tela. */
  lidaEm: string | null;
  atualizadoEm: string;

  // --- Enriquecimento (api.vw_conversa_enriquecimento, migração 0012) ------
  // Chega numa segunda consulta e é mesclado por id. Fica `undefined` no
  // instante entre a lista carregar e o enriquecimento chegar — por isso
  // opcional, e por isso a tela nunca deve tratar `undefined` como "não veio
  // de anúncio" nem como "IA desligada".
  /** Plataforma do anúncio (CTWA), quando o lead veio de anúncio. */
  fonte?: string | null;
  /** Texto do criativo do anúncio. */
  textoAnuncio?: string | null;
  /** IA atendendo esta conversa. Ausente = ainda não sabemos. */
  iaAtiva?: boolean;
  /** Total de mensagens trocadas. */
  mensagens?: number;
  /** Primeira mensagem da conversa. */
  primeiroContato?: string | null;
}

export type DirecaoMensagem = "entrada" | "saida";
export type RemetenteMensagem = "contato" | "agente" | "bot";
export type TipoConteudo = "texto" | "imagem" | "video" | "audio" | "documento" | "figurinha";

export interface Reacao {
  emoji: string;
  remetente: "agente" | "contato";
  reagidoEm: string;
}

export interface Mensagem {
  id: string;
  conversaId: string;
  direcao: DirecaoMensagem;
  remetente: RemetenteMensagem;
  tipoConteudo: TipoConteudo;
  conteudo: string | null;
  mediaPath: string | null;
  idExterno: string | null;
  /** Id "bare" real da Uazapi (NÃO confundir com idExterno, que é gerado no client pra idempotência) — necessário pra excluir/editar/reagir/responder. */
  idProvedor: string | null;
  /** Telefone da instância dona da mensagem — junto com idProvedor forma o id composto "owner:messageid" que a Uazapi usa nas ações. */
  ownerProvedor: string | null;
  /** Id local da mensagem que esta responde/cita, se houver. */
  respostaAId: string | null;
  reacoes: Reacao[];
  editadoEm: string | null;
  apagadoEm: string | null;
  statusEntrega: string | null;
  ocorridoEm: string;
  /** true enquanto aguarda confirmação da edge function — nunca persiste assim */
  otimista?: boolean;
}

export function mapConversa(row: Record<string, unknown>): Conversa {
  return {
    id: row.id as string,
    instanciaId: row.instancia_id as string,
    contatoTelefone: row.contato_telefone as string,
    contatoNome: (row.contato_nome as string) ?? null,
    ultimaMensagemConteudo: (row.ultima_mensagem_conteudo as string) ?? null,
    ultimaMensagemEm: (row.ultima_mensagem_em as string) ?? null,
    ultimaMensagemRemetente: (row.ultima_mensagem_remetente as RemetenteMensagem) ?? null,
    ultimaMensagemStatus: (row.ultima_mensagem_status as string) ?? null,
    naoLidas: (row.nao_lidas as number) ?? 0,
    lidaEm: (row.lida_em as string) ?? null,
    atualizadoEm: row.atualizado_em as string,
  };
}

export function mapMensagem(row: Record<string, unknown>): Mensagem {
  return {
    id: row.id as string,
    conversaId: row.conversa_id as string,
    direcao: row.direcao as DirecaoMensagem,
    remetente: row.remetente as RemetenteMensagem,
    tipoConteudo: row.tipo_conteudo as TipoConteudo,
    conteudo: (row.conteudo as string) ?? null,
    mediaPath: (row.media_path as string) ?? null,
    idExterno: (row.id_externo as string) ?? null,
    idProvedor: (row.id_provedor as string) ?? null,
    ownerProvedor: (row.owner_provedor as string) ?? null,
    respostaAId: (row.resposta_a_id as string) ?? null,
    reacoes: (row.reacoes as Reacao[] | null) ?? [],
    editadoEm: (row.editado_em as string) ?? null,
    apagadoEm: (row.apagado_em as string) ?? null,
    statusEntrega: (row.status_entrega as string) ?? null,
    ocorridoEm: row.ocorrido_em as string,
  };
}

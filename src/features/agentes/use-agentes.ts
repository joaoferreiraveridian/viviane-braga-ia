import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import type {
  AgenteConfig,
  AgenteTool,
  ExecucaoItem,
  ExecucaoPasso,
  ExecucaoResumo,
  FilaPendenteItem,
  FiltrosExecucao,
} from "./types";

// Toda leitura deste módulo vem do schema `api` (RPCs e views) — a tela é
// 100% leitura, nenhum hook aqui escreve em tabela nem chama edge function.
// `core` não é exposto ao Data API, mesma regra do resto da plataforma.

const LIMITE_EXECUCOES = 200;
const LIMITE_PASSOS = 500;
const LIMITE_FILA = 500;

// ---------------------------------------------------------------------------
// Mapeadores linha crua (snake_case) -> tipo da tela
// ---------------------------------------------------------------------------

interface LinhaExecucaoCrua {
  run_id: string;
  lead_id: string | null;
  lead_nome: string | null;
  lead_telefone: string | null;
  status: string;
  model: string | null;
  provider: string | null;
  input_text: string | null;
  output_text: string | null;
  finish_reason: string | null;
  total_tokens: number | string | null;
  prompt_tokens: number | string | null;
  completion_tokens: number | string | null;
  cost_usd: number | string | null;
  latency_ms: number | string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  total_steps: number | string | null;
  ferramentas_usadas: string[] | null;
  partes_enviadas: number | string | null;
  ultimo_step_tipo: string | null;
  ultimo_step_erro: string | null;
}

function paraNumeroOuNull(valor: number | string | null): number | null {
  if (valor === null || valor === undefined) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function mapExecucao(linha: LinhaExecucaoCrua): ExecucaoItem {
  return {
    runId: linha.run_id,
    leadId: linha.lead_id,
    leadNome: linha.lead_nome,
    leadTelefone: linha.lead_telefone,
    status: linha.status,
    model: linha.model,
    provider: linha.provider,
    inputText: linha.input_text,
    outputText: linha.output_text,
    finishReason: linha.finish_reason,
    totalTokens: paraNumeroOuNull(linha.total_tokens),
    promptTokens: paraNumeroOuNull(linha.prompt_tokens),
    completionTokens: paraNumeroOuNull(linha.completion_tokens),
    costUsd: paraNumeroOuNull(linha.cost_usd),
    latencyMs: paraNumeroOuNull(linha.latency_ms),
    error: linha.error,
    createdAt: linha.created_at,
    startedAt: linha.started_at,
    finishedAt: linha.finished_at,
    totalSteps: paraNumeroOuNull(linha.total_steps),
    ferramentasUsadas: linha.ferramentas_usadas ?? [],
    partesEnviadas: paraNumeroOuNull(linha.partes_enviadas),
    ultimoStepTipo: linha.ultimo_step_tipo,
    ultimoStepErro: linha.ultimo_step_erro,
  };
}

interface LinhaResumoCrua {
  total_runs: number | string;
  succeeded: number | string;
  failed: number | string;
  skipped: number | string;
  pending: number | string;
  running: number | string;
  custo_total_usd: number | string | null;
  tokens_totais: number | string | null;
  latencia_media_ms: number | string | null;
}

function mapResumo(linha: LinhaResumoCrua): ExecucaoResumo {
  return {
    totalRuns: Number(linha.total_runs),
    succeeded: Number(linha.succeeded),
    failed: Number(linha.failed),
    skipped: Number(linha.skipped),
    pending: Number(linha.pending),
    running: Number(linha.running),
    custoTotalUsd: paraNumeroOuNull(linha.custo_total_usd),
    tokensTotais: paraNumeroOuNull(linha.tokens_totais),
    latenciaMediaMs: paraNumeroOuNull(linha.latencia_media_ms),
  };
}

interface LinhaPassoCrua {
  passo_id: string;
  run_id: string;
  step_index: number | string;
  step_type: string;
  tool_name: string | null;
  input: unknown;
  output: unknown;
  tokens: number | string | null;
  latency_ms: number | string | null;
  error: string | null;
  created_at: string;
}

function mapPasso(linha: LinhaPassoCrua): ExecucaoPasso {
  return {
    passoId: linha.passo_id,
    runId: linha.run_id,
    stepIndex: Number(linha.step_index),
    stepType: linha.step_type,
    toolName: linha.tool_name,
    input: linha.input,
    output: linha.output,
    tokens: paraNumeroOuNull(linha.tokens),
    latencyMs: paraNumeroOuNull(linha.latency_ms),
    error: linha.error,
    createdAt: linha.created_at,
  };
}

interface LinhaConfigCrua {
  config_id: string;
  organization_id: string | null;
  provider: string | null;
  model: string | null;
  temperature: number | string | null;
  system_prompt: string | null;
  debounce_seconds: number | string | null;
  debounce_seconds_test: number | string | null;
  test_phones: string[] | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

function mapConfig(linha: LinhaConfigCrua): AgenteConfig {
  return {
    configId: linha.config_id,
    organizationId: linha.organization_id,
    provider: linha.provider,
    model: linha.model,
    temperature: paraNumeroOuNull(linha.temperature),
    systemPrompt: linha.system_prompt,
    debounceSeconds: paraNumeroOuNull(linha.debounce_seconds),
    debounceSecondsTest: paraNumeroOuNull(linha.debounce_seconds_test),
    testPhones: linha.test_phones ?? [],
    enabled: linha.enabled,
    createdAt: linha.created_at,
    updatedAt: linha.updated_at,
  };
}

interface LinhaToolCrua {
  tool_id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  schema: unknown;
  created_at: string;
  updated_at: string;
}

function mapTool(linha: LinhaToolCrua): AgenteTool {
  return {
    toolId: linha.tool_id,
    organizationId: linha.organization_id,
    name: linha.name,
    description: linha.description,
    enabled: linha.enabled,
    schema: linha.schema,
    createdAt: linha.created_at,
    updatedAt: linha.updated_at,
  };
}

interface LinhaFilaCrua {
  buffer_id: string;
  lead_id: string | null;
  lead_nome: string | null;
  phone: string | null;
  content: string | null;
  received_at: string;
  consumed_at: string | null;
  run_id: string | null;
}

function mapFilaPendente(linha: LinhaFilaCrua): FilaPendenteItem {
  return {
    bufferId: linha.buffer_id,
    leadId: linha.lead_id,
    leadNome: linha.lead_nome,
    phone: linha.phone,
    content: linha.content,
    receivedAt: linha.received_at,
    consumedAt: linha.consumed_at,
    runId: linha.run_id,
  };
}

// ---------------------------------------------------------------------------
// useIaResumo — api.fn_agente_execucao_resumo
// ---------------------------------------------------------------------------

interface EstadoResumo {
  resumo: ExecucaoResumo | null;
  carregando: boolean;
  erro: boolean;
  atualizadoEm: string | null;
}

export function useIaResumo(desdeIso: string, ateIso: string) {
  const [estado, setEstado] = useState<EstadoResumo>({ resumo: null, carregando: true, erro: false, atualizadoEm: null });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setEstado({ resumo: null, carregando: false, erro: false, atualizadoEm: null });
      return;
    }
    let ativo = true;
    setEstado((s) => ({ ...s, carregando: true, erro: false }));

    supabase
      .schema("api")
      .rpc("fn_agente_execucao_resumo", { p_desde: desdeIso, p_ate: ateIso })
      .then(({ data, error }) => {
        if (!ativo) return;
        const linhas = data as LinhaResumoCrua[] | null;
        if (error || !linhas) {
          setEstado({ resumo: null, carregando: false, erro: true, atualizadoEm: null });
          return;
        }
        setEstado({
          resumo: linhas.length > 0 ? mapResumo(linhas[0]) : null,
          carregando: false,
          erro: false,
          atualizadoEm: new Date().toISOString(),
        });
      });

    return () => {
      ativo = false;
    };
  }, [desdeIso, ateIso, versao]);

  return { ...estado, recarregar: () => setVersao((v) => v + 1) };
}

// ---------------------------------------------------------------------------
// useIaExecucoes — api.fn_agente_execucao_lista
// ---------------------------------------------------------------------------

interface EstadoExecucoes {
  itens: ExecucaoItem[];
  carregando: boolean;
  erro: boolean;
}

export function useIaExecucoes(
  desdeIso: string,
  ateIso: string,
  apenasErros: boolean,
  filtros: FiltrosExecucao,
) {
  const [estado, setEstado] = useState<EstadoExecucoes>({ itens: [], carregando: true, erro: false });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setEstado({ itens: [], carregando: false, erro: false });
      return;
    }
    let ativo = true;
    setEstado((s) => ({ ...s, carregando: true, erro: false }));

    supabase
      .schema("api")
      .rpc("fn_agente_execucao_lista", {
        p_desde: desdeIso,
        p_ate: ateIso,
        p_apenas_erros: apenasErros,
        p_limite: LIMITE_EXECUCOES,
        // `null` (não string vazia) é o que a função entende como "sem
        // filtro" — ver 0011.
        p_status: filtros.status.length > 0 ? filtros.status : null,
        p_busca: filtros.busca.trim() || null,
        p_ferramenta: filtros.ferramenta || null,
      })
      .then(({ data, error }) => {
        if (!ativo) return;
        const linhas = data as LinhaExecucaoCrua[] | null;
        if (error || !linhas) {
          setEstado({ itens: [], carregando: false, erro: true });
          return;
        }
        setEstado({ itens: linhas.map(mapExecucao), carregando: false, erro: false });
      });

    return () => {
      ativo = false;
    };
    // `filtros` é recriado a cada render em quem chama; serializar evita
    // refazer a consulta sem o recorte ter mudado de verdade.
  }, [desdeIso, ateIso, apenasErros, JSON.stringify(filtros), versao]);

  return { ...estado, recarregar: () => setVersao((v) => v + 1) };
}

// ---------------------------------------------------------------------------
// useIaExecucaoPassos — api.vw_agente_execucao_passo, filtrada por run_id
// ---------------------------------------------------------------------------

interface EstadoPassos {
  itens: ExecucaoPasso[];
  carregando: boolean;
  erro: boolean;
}

export function useIaExecucaoPassos(runId: string | null) {
  const [estado, setEstado] = useState<EstadoPassos>({ itens: [], carregando: false, erro: false });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!runId) {
      setEstado({ itens: [], carregando: false, erro: false });
      return;
    }
    if (!supabase) {
      setEstado({ itens: [], carregando: false, erro: false });
      return;
    }

    let ativo = true;
    setEstado({ itens: [], carregando: true, erro: false });

    supabase
      .schema("api")
      .from("vw_agente_execucao_passo")
      .select("*")
      .eq("run_id", runId)
      .order("step_index", { ascending: true })
      .limit(LIMITE_PASSOS)
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error || !data) {
          setEstado({ itens: [], carregando: false, erro: true });
          return;
        }
        setEstado({ itens: (data as LinhaPassoCrua[]).map(mapPasso), carregando: false, erro: false });
      });

    return () => {
      ativo = false;
    };
  }, [runId, versao]);

  return { ...estado, recarregar: () => setVersao((v) => v + 1) };
}

// ---------------------------------------------------------------------------
// useIaAgenteConfig — api.vw_agente_config (hoje, 1 linha só)
// ---------------------------------------------------------------------------

interface EstadoConfig {
  config: AgenteConfig | null;
  carregando: boolean;
  erro: boolean;
}

export function useIaAgenteConfig() {
  const [estado, setEstado] = useState<EstadoConfig>({ config: null, carregando: true, erro: false });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setEstado({ config: null, carregando: false, erro: false });
      return;
    }
    let ativo = true;
    setEstado((s) => ({ ...s, carregando: true, erro: false }));

    supabase
      .schema("api")
      .from("vw_agente_config")
      .select("*")
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error || !data) {
          setEstado({ config: null, carregando: false, erro: true });
          return;
        }
        const linhas = data as LinhaConfigCrua[];
        setEstado({ config: linhas.length > 0 ? mapConfig(linhas[0]) : null, carregando: false, erro: false });
      });

    return () => {
      ativo = false;
    };
  }, [versao]);

  return { ...estado, recarregar: () => setVersao((v) => v + 1) };
}

// ---------------------------------------------------------------------------
// useIaTools — api.vw_agente_tool
// ---------------------------------------------------------------------------

interface EstadoTools {
  itens: AgenteTool[];
  carregando: boolean;
  erro: boolean;
}

export function useIaTools() {
  const [estado, setEstado] = useState<EstadoTools>({ itens: [], carregando: true, erro: false });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setEstado({ itens: [], carregando: false, erro: false });
      return;
    }
    let ativo = true;
    setEstado((s) => ({ ...s, carregando: true, erro: false }));

    supabase
      .schema("api")
      .from("vw_agente_tool")
      .select("*")
      .order("name", { ascending: true })
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error || !data) {
          setEstado({ itens: [], carregando: false, erro: true });
          return;
        }
        setEstado({ itens: (data as LinhaToolCrua[]).map(mapTool), carregando: false, erro: false });
      });

    return () => {
      ativo = false;
    };
  }, [versao]);

  return { ...estado, recarregar: () => setVersao((v) => v + 1) };
}

// ---------------------------------------------------------------------------
// useIaFilaPendente — api.vw_agente_fila_pendente
// ---------------------------------------------------------------------------

interface EstadoFilaPendente {
  itens: FilaPendenteItem[];
  carregando: boolean;
  erro: boolean;
}

export function useIaFilaPendente() {
  const [estado, setEstado] = useState<EstadoFilaPendente>({ itens: [], carregando: true, erro: false });
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    if (!supabase) {
      setEstado({ itens: [], carregando: false, erro: false });
      return;
    }
    let ativo = true;
    setEstado((s) => ({ ...s, carregando: true, erro: false }));

    supabase
      .schema("api")
      .from("vw_agente_fila_pendente")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(LIMITE_FILA)
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error || !data) {
          setEstado({ itens: [], carregando: false, erro: true });
          return;
        }
        setEstado({ itens: (data as LinhaFilaCrua[]).map(mapFilaPendente), carregando: false, erro: false });
      });

    return () => {
      ativo = false;
    };
  }, [versao]);

  return { ...estado, recarregar: () => setVersao((v) => v + 1) };
}

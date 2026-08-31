// Aplica o handoff (docs/handoff-projeto-novo.md) no projeto Supabase novo,
// via Management API. Existe por um motivo só: o system prompt e as descrições
// das tools vão para o banco lidos do disco, nunca redigitados — foi assim que
// a tentativa anterior corrompeu um caractere ("Ç" -> "C" em RESTRIÇÕES).
//
//   SUPABASE_ACCESS_TOKEN=sbp_...  node scripts/aplicar.mjs <passo>
//
// passos: extensoes | migracoes | seed | prova | limpar | vault | verificar
// (`vault` também precisa de SUPABASE_SERVICE_ROLE_KEY no ambiente)

import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const REF = process.env.SUPABASE_PROJECT_REF ?? 'rwuwdkurqkubiiaiuafo';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
// SHA do prompt em docs/prompt-sistema-atual.md. Mudou em 30/08 quando a tool
// `crm` saiu do prompt (decisão do João): ela nunca foi migrada, mas o prompt
// mandava chamá-la 'SEMPRE, para QUALQUER solicitação', então toda run gastava
// um passo de erro + uma ida extra ao LLM (~30% do custo) para se recuperar.
// SHA anterior, com crm: 177c607f9558d69f75d88ef53cd682ebb91732fdc7066b2e840771a4bdb4f938
const SHA_ESPERADO = '9c91a76ce274d1178567758fe1ad9ee53d07079dbc53f42bcf9e0bd9f320a4bc';

async function sql(query) {
  if (!TOKEN) throw new Error('Falta SUPABASE_ACCESS_TOKEN (Supabase → Account → Access Tokens).');
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${body.slice(0, 800)}`);
  return body ? JSON.parse(body) : [];
}

const mostrar = (rotulo, linhas) => console.log(rotulo, JSON.stringify(linhas));

// -- o texto que não pode ser tocado ------------------------------------------
function lerPrompt() {
  const bytes = readFileSync('docs/prompt-sistema-atual.md');
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== SHA_ESPERADO) throw new Error(`SHA do arquivo mudou: ${sha}`);
  const texto = bytes.toString('utf8');
  if (texto.includes('$prompt_vb$')) throw new Error('Tag de dollar-quoting colide com o texto.');
  return texto;
}

// Descrições das tools saem do export do n8n, não de string redigitada aqui.
function lerDescricoesTools() {
  const nos = JSON.stringify(JSON.parse(readFileSync('n8n/agente-base-viviane_braga.json', 'utf8')));
  const acha = (agulha) => {
    const encontrados = [...nos.matchAll(/"description":("(?:[^"\\]|\\.)*")/g)]
      .map((m) => JSON.parse(m[1]))
      .filter((d) => d.includes(agulha));
    if (encontrados.length !== 1) throw new Error(`Descrição de "${agulha}": ${encontrados.length} candidatos.`);
    return encontrados[0];
  };
  return { think: acha('organizar seus pensamentos'), notificacao: acha('clínciasobre') };
}

const lit = (s) => `'${s.replace(/'/g, "''")}'`;

// -- passos -------------------------------------------------------------------
const passos = {
  // Confere offline o que vai para o banco lido do disco. Roda sem token.
  async conferir() {
    const prompt = lerPrompt();
    const tools = lerDescricoesTools();
    console.log('sha do arquivo confere:', SHA_ESPERADO);
    console.log('bytes:', Buffer.byteLength(prompt, 'utf8'), '| começa:', JSON.stringify(prompt.slice(0, 30)));
    console.log('termina:', JSON.stringify(prompt.slice(-30)));
    console.log('RESTRIÇÕES intacto:', prompt.includes('RESTRIÇÕES'));
    console.log('tools:', JSON.stringify(tools, null, 2).slice(0, 400));
  },

  // Grava só o system_prompt, pela API de dados, com a service_role — para o
  // caso de o acesso ser só o MCP (que obrigaria a reemitir os 18 KB inline,
  // que é como o "Ç" de RESTRIÇÕES virou "C" na tentativa anterior).
  // Antes deste passo, criar a função pelo MCP:
  //
  //   create or replace function public.fn_gravar_system_prompt(p_prompt text)
  //   returns text language sql security definer set search_path to 'pg_catalog','core','public' as $$
  //     update core.agente_ia_config set system_prompt = p_prompt, atualizado_em = now()
  //      where canal_codigo = 'whatsapp'
  //      returning encode(sha256(system_prompt::bytea),'hex');
  //   $$;
  //   revoke all on function public.fn_gravar_system_prompt(text) from public, anon, authenticated;
  //
  // e DEPOIS: drop function public.fn_gravar_system_prompt(text);
  async 'prompt-rest'() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY no ambiente.');
    const r = await fetch(`https://${REF}.supabase.co/rest/v1/rpc/fn_gravar_system_prompt`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_prompt: lerPrompt() }),
    });
    const sha = (await r.text()).replace(/"/g, '');
    console.log(`sha no banco: ${sha}\nconfere: ${sha === SHA_ESPERADO}`);
    if (sha !== SHA_ESPERADO) process.exit(1);
  },

  async extensoes() {
    mostrar('extensoes:', await sql(`
      create extension if not exists pg_cron;
      create extension if not exists pg_net;
      select extname, extnamespace::regnamespace::text as schema
        from pg_extension where extname in ('pg_cron','pg_net') order by extname;`));
  },

  async migracoes() {
    for (const arquivo of readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort()) {
      process.stdout.write(`${arquivo} ... `);
      await sql(readFileSync(`supabase/migrations/${arquivo}`, 'utf8'));
      console.log('ok');
    }
  },

  async seed() {
    const prompt = lerPrompt();
    const tools = lerDescricoesTools();

    await sql(`
      insert into core.agente_ia_config (
        canal_codigo, provider, model, system_prompt,
        debounce_seconds, debounce_seconds_test, test_phones,
        memoria_janela_mensagens, comando_pausar, comando_voltar, comando_zerar_memoria,
        etiqueta_bloqueio, enabled, somente_test_phones,
        notificacao_destino_comercial, notificacao_destino_administrativo
      ) values (
        'whatsapp', 'openrouter', 'deepseek/deepseek-v4-flash-0731',
        $prompt_vb$${prompt}$prompt_vb$,
        30, 1, array['5521977297413'],
        15, '#pausar', '#voltar', '#zerar',
        '5521968482967:13', false, true,
        '120363418007788352@g.us', '120363422190772879@g.us'
      )
      on conflict (canal_codigo) do update set
        provider = excluded.provider, model = excluded.model,
        system_prompt = excluded.system_prompt,
        debounce_seconds = excluded.debounce_seconds,
        debounce_seconds_test = excluded.debounce_seconds_test,
        test_phones = excluded.test_phones,
        memoria_janela_mensagens = excluded.memoria_janela_mensagens,
        comando_pausar = excluded.comando_pausar, comando_voltar = excluded.comando_voltar,
        comando_zerar_memoria = excluded.comando_zerar_memoria,
        etiqueta_bloqueio = excluded.etiqueta_bloqueio,
        enabled = excluded.enabled, somente_test_phones = excluded.somente_test_phones,
        notificacao_destino_comercial = excluded.notificacao_destino_comercial,
        notificacao_destino_administrativo = excluded.notificacao_destino_administrativo,
        atualizado_em = now();`);

    await sql(`
      insert into core.agente_ia_tool (name, description, enabled) values
        ('think', ${lit(tools.think)}, true),
        ('notificacao', ${lit(tools.notificacao)}, true)
      on conflict (name) do update set
        description = excluded.description, enabled = excluded.enabled, atualizado_em = now();`);

    mostrar('instancia:', await sql(`
      insert into public.whatsapp_instancias (nome, base_url, token, webhook_secret)
      values ('viviane-braga', 'https://odontonova.uazapi.com',
              '42d79958-35b7-47a6-a229-799709da2433', encode(gen_random_bytes(24), 'hex'))
      on conflict (nome) do update set base_url = excluded.base_url, token = excluded.token
      returning nome, webhook_secret;`));

    mostrar('sha do prompt no banco:', await sql(`
      select encode(sha256(system_prompt::bytea), 'hex') as sha,
             encode(sha256(system_prompt::bytea), 'hex') = ${lit(SHA_ESPERADO)} as confere,
             length(system_prompt) as caracteres, octet_length(system_prompt) as bytes
        from core.agente_ia_config where canal_codigo = 'whatsapp';`));
  },

  // Prova da trava. Roda ANTES do Vault de propósito: sem os segredos, o
  // net.http_post não acontece e nenhuma mensagem sai — a run do telefone de
  // teste nasce 'failed' com o aviso do Vault, que é exatamente o que queremos
  // ver aqui. O que se prova é quem VIRA run, não o que a run faz depois.
  async prova() {
    const teste = '+5521977297413';
    const ficticios = ['+5521999990001', '+5511988880002'];
    await sql(`update core.agente_ia_config set enabled = true where canal_codigo = 'whatsapp';`);
    await sql([teste, ...ficticios].map((tel, i) => `
      select core.agente_ia_enqueue_message(
        ('00000000-0000-4000-8000-00000000000${i + 1}')::uuid, ${lit(tel)},
        'prova da trava', 'prova-${i + 1}');`).join('\n'));
    // Envelhece o buffer para além do debounce de 30s, senão nada vence.
    await sql(`update core.agente_ia_mensagem_buffer set received_at = now() - interval '5 minutes'
                where message_id like 'prova-%';`);
    await sql(`select core.agente_ia_flush_due_buffers();`);
    await sql(`update core.agente_ia_config set enabled = false where canal_codigo = 'whatsapp';`);
    mostrar('runs criadas (esperado: só o telefone de teste):', await sql(`
      select telefone_e164, status, error from core.agente_ia_run order by created_at;`));
    mostrar('buffer restante:', await sql(`
      select telefone_e164, (consumed_at is not null) as consumido
        from core.agente_ia_mensagem_buffer where message_id like 'prova-%' order by telefone_e164;`));
  },

  async limpar() {
    await sql(`
      delete from core.agente_ia_run
       where pessoa_id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003');
      delete from core.agente_ia_mensagem_buffer where message_id like 'prova-%';
      delete from core.agente_ia_estado
       where pessoa_id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003');`);
    mostrar('sobrou algo? (esperado: tudo zero e enabled=false):', await sql(`
      select (select count(*) from core.agente_ia_run) as runs,
             (select count(*) from core.agente_ia_mensagem_buffer) as buffer,
             (select count(*) from core.agente_ia_estado) as estados,
             (select enabled from core.agente_ia_config where canal_codigo='whatsapp') as enabled,
             (select somente_test_phones from core.agente_ia_config where canal_codigo='whatsapp') as trava;`));
  },

  async vault() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY no ambiente.');
    for (const [nome, valor] of [
      ['agente_ia_edge_url', `https://${REF}.supabase.co/functions/v1`],
      ['agente_ia_service_role_key', key],
    ]) {
      await sql(`
        select case
          when exists (select 1 from vault.secrets where name = ${lit(nome)})
            then (select vault.update_secret(id, ${lit(valor)}) from vault.secrets where name = ${lit(nome)})::text
          else vault.create_secret(${lit(valor)}, ${lit(nome)})::text
        end;`);
    }
    mostrar('vault (lido pela função do agente):', await sql(`
      select core.fn_agente_ia_secret('agente_ia_edge_url') as edge_url,
             left(core.fn_agente_ia_secret('agente_ia_service_role_key'), 12) || '...' as service_key;`));
  },

  async verificar() {
    mostrar('prompt:', await sql(`
      select encode(sha256(system_prompt::bytea),'hex') = ${lit(SHA_ESPERADO)} as sha_confere,
             enabled, somente_test_phones, test_phones, model,
             notificacao_destino_comercial, notificacao_destino_administrativo
        from core.agente_ia_config where canal_codigo='whatsapp';`));
    mostrar('cron:', await sql(`select jobname, schedule, active from cron.job order by jobname;`));
    // anon: nada. authenticated: só as duas RPC que as telas chamam (0005).
    mostrar('funcoes de core/api por papel:', await sql(`
      select n.nspname || '.' || p.proname as funcao,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as autenticado
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('core','api')
         and (has_function_privilege('anon', p.oid, 'execute')
              or has_function_privilege('authenticated', p.oid, 'execute'))
       order by 1;`));
    mostrar('tools:', await sql(`select name, enabled, left(description, 40) as inicio from core.agente_ia_tool order by name;`));
  },
};

const passo = process.argv[2];
if (!passos[passo]) {
  console.error(`Passos: ${Object.keys(passos).join(' | ')}`);
  process.exit(1);
}
await passos[passo]();

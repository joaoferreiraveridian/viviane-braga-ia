// =============================================================================
// phone.ts — normalização de telefone para E.164, num único lugar.
// =============================================================================
// Armadilha documentada (agente-n8n-supabase/reference/armadilhas.md): o n8n
// deste projeto ora incluía o DDI 55, ora removia (`.substring(2)`,
// `.replace(/^55/,'')`) em pontos diferentes do fluxo. Normalizar num único
// lugar evita duplicar pessoa por suposição errada de DDI/tamanho.
//
// Escopo: só Brasil (única geografia deste cliente). Não usar esta função em
// projeto multi-país sem revisar — presume DDI 55 quando o número não traz
// nenhum DDI.

/**
 * Normaliza um telefone (wa_chatid da Uazapi, com ou sem sufixo
 * "@s.whatsapp.net"/"@g.us", ou uma string já em E.164) para E.164
 * ("+55DDDNUMERO"). Devolve `null` se não houver dígito nenhum.
 */
export function normalizePhoneE164(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const digits = raw.split('@')[0].replace(/\D/g, '');
  if (!digits) return null;

  // Já tem DDI 55 e tamanho de DDD + número (8 ou 9 dígitos locais).
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }

  // Sem DDI: DDD (2) + número (8 ou 9) = 10 ou 11 dígitos — assume Brasil.
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }

  // Formato não reconhecido: devolve com "+" na frente, sem adivinhar DDI —
  // evita duplicar pessoa por suposição errada (ver armadilhas.md).
  return `+${digits}`;
}

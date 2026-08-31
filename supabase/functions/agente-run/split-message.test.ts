// Check mínimo do splitter. Roda com:
//   npx deno@2 run --allow-read supabase/functions/agente-run/split-message.test.ts
import { splitAgentMessage, SPLIT_MAX_CHARS, SPLIT_MIN_CHARS } from './split-message.ts';

function eq(rotulo: string, obtido: unknown, esperado: unknown) {
  const o = JSON.stringify(obtido), e = JSON.stringify(esperado);
  if (o !== e) throw new Error(`${rotulo}\n  esperado: ${e}\n  obtido:   ${o}`);
  console.log(`ok  ${rotulo}`);
}

// A saudação real do agente (30/08). Com a regra do n8n (buffer guloso de 500)
// isso saía numa mensagem só. Agora: uma por sentença, colando as curtas.
const saudacao = 'Boa noite. Seja bem-vindo(a) ao Viviane Braga Advocacia. Sou Elisa, e vou entender seu caso. Como posso ajudar?';
eq('saudação vira 3 partes, "Boa noite" colado', splitAgentMessage(saudacao), [
  'Boa noite. Seja bem-vindo(a) ao Viviane Braga Advocacia',
  'Sou Elisa, e vou entender seu caso',
  'Como posso ajudar?',
]);

// Frases longas não são mais agrupadas só porque cabem em 500.
eq('duas frases longas viram 2 partes', splitAgentMessage(
  'Preciso entender melhor a sua situação para te orientar direito. Me conta desde quando esse problema começou?'
).length, 2);

// Sobra curta no fim gruda na anterior em vez de sair solta...
eq('sobra curta no fim não sai solta', splitAgentMessage(
  'Consigo te ajudar com a revisional do seu veículo sem problema. Ok.'
), ['Consigo te ajudar com a revisional do seu veículo sem problema. Ok']);

// ...mas pergunta final é beat intencional e fica sozinha, mesmo curta.
eq('pergunta final curta fica sozinha', splitAgentMessage(
  'Consigo te ajudar com a revisional do seu veículo sem problema. Pode ser?'
), ['Consigo te ajudar com a revisional do seu veículo sem problema', 'Pode ser?']);

// Regras herdadas do n8n que não podem regredir.
eq('tira o ponto final', splitAgentMessage('Oi.'), ['Oi']);
eq('**negrito** -> *negrito*', splitAgentMessage('**oi**'), ['*oi*']);
eq('Prazer -> Feliz em conhecer', splitAgentMessage('Prazer!'), ['Feliz em conhecer!']);
eq('lista de bullets fica inteira', splitAgentMessage('- um\n- dois\n- três'), ['- um\n- dois\n- três']);
eq('parágrafos continuam separando', splitAgentMessage('Primeiro bloco aqui.\n\nSegundo bloco aqui.').length, 2);

// Sentença gigante: o fallback quebra por "\n". Uma LINHA única acima do teto
// sai inteira — limitação herdada do "Code in JavaScript4" do n8n, que tem o
// mesmo fallback. Não é regressão; está documentado aqui para o dia em que
// alguém achar uma mensagem de 1600 caracteres no WhatsApp e vier procurar.
// ponytail: teto por linha, não por caractere. Só vale mexer se o agente
// passar a emitir linha longa sem pontuação — hoje não emite.
const linhaLonga = 'palavra '.repeat(200).trim();
const partes = splitAgentMessage(linhaLonga + '\n' + linhaLonga);
eq('linha única acima do teto não quebra por caractere', partes.length, 2);
if (partes.every((p) => p.length <= SPLIT_MAX_CHARS)) {
  throw new Error('o teto por linha deixou de valer — reveja o comentário acima');
}
console.log('ok  teto por linha documentado (herdado do n8n)');

console.log(`\ntodos os checks passaram (min=${SPLIT_MIN_CHARS}, max=${SPLIT_MAX_CHARS})`);

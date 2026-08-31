# Features

Todo domínio novo (ex: `clientes`, `pedidos`, `faturas`) mora em
`src/features/<dominio>/`, com esta estrutura:

- `api.ts` — funções de acesso a dados e hooks de `@tanstack/react-query`
  (`useQuery`, `useMutation`). Nenhum componente chama `fetch`/`supabase`
  direto — sempre passa por aqui.
- `components/` — componentes visuais específicos do domínio, montados
  a partir dos patterns em `src/components/patterns/`.
- `types.ts` — tipos e schemas zod do domínio.

Páginas em `src/pages/` só compõem: importam de `features/<dominio>/`
e de `components/patterns/`, sem lógica de negócio própria. Isso
mantém a tela fina e o domínio testável fora do React.

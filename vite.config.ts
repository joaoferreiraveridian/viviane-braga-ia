import path from "path";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

// Configuração de partida do template. Ajuste porta/host conforme o app
// concreto precisar (ex.: para não colidir com outro projeto local).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});

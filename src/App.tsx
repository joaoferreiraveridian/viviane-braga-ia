import { RouterProvider } from "react-router-dom";

import { PortaoDeAutenticacao } from "@/lib/auth";
import { router } from "@/router";

function App() {
  return (
    <PortaoDeAutenticacao>
      <RouterProvider router={router} />
    </PortaoDeAutenticacao>
  );
}

export default App;

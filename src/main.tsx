import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import App from "./App";
import "./tokens.css";
import "./styles.css";
import "./components.css";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
const client = new ConvexReactClient(url ?? "http://127.0.0.1:3210");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexProvider client={client}>
      <App />
    </ConvexProvider>
  </StrictMode>,
);

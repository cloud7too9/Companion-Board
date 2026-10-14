import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { Fehlergrenze, SeiteAbgestuerzt } from "../shared/ui/Fehlergrenze";
import "../shared/styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Fehlergrenze ersatz={<SeiteAbgestuerzt />}>
      <App />
    </Fehlergrenze>
  </React.StrictMode>,
);

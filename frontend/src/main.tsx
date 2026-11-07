import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { DemoProvider } from "./context/DemoContext";
import { SettingsProvider } from "./context/SettingsContext";
import { SpeechProvider } from "./context/SpeechContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SettingsProvider>
        <SpeechProvider>
          <AuthProvider>
            <DemoProvider>
              <App />
            </DemoProvider>
          </AuthProvider>
        </SpeechProvider>
      </SettingsProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

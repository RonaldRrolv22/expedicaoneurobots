import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const OMIE_APP_KEY = "1511136822195";
const OMIE_APP_SECRET = "e1af2faaa330cc0f5024b9e3b87244f0";
const BASE_URL = "https://app.omie.com.br/api/v1";

async function chamarOmie(endpoint: string, call: string, param: any) {
  const url = `${BASE_URL}/${endpoint}/`;
  const payload = {
    call,
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: [param],
  };

  const response = await axios.post(url, payload, { timeout: 30000 });
  return response.data;
}

async function runTest() {
  try {
    const param = {
      pagina: 1,
      registros_por_pagina: 100,
    };
    const resp = await chamarOmie("servicos/os", "ListarOS", param);
    console.log("Sucesso! length:", resp?.osCadastro?.length || 0);
    
    const etapas: Record<string, number> = {};
    if (resp?.osCadastro) {
        for (const os of resp.osCadastro) {
            const etapa = os.Cabecalho?.cEtapa || "Sem Etapa";
            etapas[etapa] = (etapas[etapa] || 0) + 1;
        }
    }
    console.log("Etapas encontradas:", etapas);
    
    // Print one example for each stage
    if (resp?.osCadastro) {
        const seen = new Set();
        for (const os of resp.osCadastro) {
            const etapa = os.Cabecalho?.cEtapa || "Sem Etapa";
            if (!seen.has(etapa)) {
                console.log(`Exemplo Etapa ${etapa}:`, {
                    numOS: os.Cabecalho?.cNumOS,
                    cliente: os.Cabecalho?.nCodCli,
                    faturada: os.InfoCadastro?.cFaturada
                });
                seen.add(etapa);
            }
        }
    }
  } catch (e: any) {
    console.error("Erro:", e.response?.data || e.message);
  }
}
runTest();

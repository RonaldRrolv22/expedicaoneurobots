import axios from "axios";
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

  try {
    const response = await axios.post(url, payload, { timeout: 30000 });
    return response.data;
  } catch (error: any) {
    console.error("ERRO OMIE", call, error.response?.data || error.message);
    return null;
  }
}

async function run() {
  console.log("Testando ListarNF (amplo)...");
  const nfAmpla = await chamarOmie("produtos/nfconsultar", "ListarNF", {
    pagina: 1, registros_por_pagina: 50, dEmiInicial: "01/05/2026", dEmiFinal: "08/05/2026", tpNF: "1", tpAmb: "1", filtrar_por_status: "N", cDetalhesPedido: "S", cApenasResumo: "N"
  });
  if (nfAmpla && nfAmpla.nfCadastro && nfAmpla.nfCadastro.length > 0) {
      console.log("Uma NF encontrada:");
      console.log("ide.nNF =", nfAmpla.nfCadastro[0].ide?.nNF);
      console.log("pedido.cNumPedido =", nfAmpla.nfCadastro[0].pedido?.cNumPedido);
      console.log("pedido.nIdPedido =", nfAmpla.nfCadastro[0].pedido?.nIdPedido);
  }
}

run();

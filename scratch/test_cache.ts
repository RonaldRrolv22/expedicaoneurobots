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
  const data = response.data;
  if (data.faultstring) throw new Error(data.faultstring);
  return data;
}

function formatOmieDate(d: Date) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

async function runTest() {
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(fim.getDate() - 90);
  const data_inicio = formatOmieDate(inicio);
  const data_fim = formatOmieDate(fim);
  console.log("Buscando de", data_inicio, "ate", data_fim);

  let todasProdutos: any[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  while (pagina <= totalPaginas) {
    try {
      const paramProdutos = {
        pagina: pagina, registros_por_pagina: 100,
        dEmiInicial: data_inicio, dEmiFinal: data_fim,
        tpNF: "1", tpAmb: "1", filtrar_por_status: "N",
        cDetalhesPedido: "S", cApenasResumo: "N",
      };
      const respProd = await chamarOmie("produtos/nfconsultar", "ListarNF", paramProdutos);
      if (pagina === 1) totalPaginas = respProd.total_de_paginas || 1;
      if (respProd.nfCadastro) todasProdutos = todasProdutos.concat(respProd.nfCadastro);
      pagina++;
    } catch (e: any) {
      console.error("Erro Produtos:", e.response?.data || e.message);
      break;
    }
  }
  console.log("Produtos ListarNF length:", todasProdutos.length);

  try {
    const paramServ = {
      nPagina: 1, nRegPorPagina: 100,
      dEmiInicial: data_inicio, dEmiFinal: data_fim
    };
    const respServ = await chamarOmie("servicos/nfse", "ListarNFSEs", paramServ);
    console.log("Servicos ListarNFSEs length:", respServ?.nfseCadastro?.length || 0);
  } catch (e: any) {
    console.error("Erro Servicos:", e.response?.data || e.message);
  }

  const buscar = ["2008", "2009", "2011", "2004", "1999"];
  for (const ped of buscar) {
    const p = todasProdutos.find(x => String(x.pedido?.cNumPedido || "").trim().toUpperCase().includes(ped));
    if (p) {
        console.log("Encontrou produto para:", ped, p.ide.nNF);
    } else {
        console.log("NAO ENCONTROU PRODUTO PARA:", ped);
    }
  }
}
runTest();

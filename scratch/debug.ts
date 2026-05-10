import axios from "axios";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import fs from "fs";
import path from "path";

const OMIE_APP_KEY = "1511136822195";
const OMIE_APP_SECRET = "e1af2faaa330cc0f5024b9e3b87244f0";
const BASE_URL = "https://app.omie.com.br/api/v1";
const SHEET_ID = "1xpTC9L5fNmiqwXh3RjYPmMk-L6EP9exzIB1gg5p2-tc";
const SHEET_SERIAL_ID = "14GL1MIuEY7o1nvnEtgC7-siurYSzcbFBwxC1yQ8J3fc";

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
    const data = response.data;
    if (data.faultstring) throw new Error(data.faultstring);
    return data;
  } catch (error: any) {
    if (error.response?.status === 429 || error.response?.data?.faultstring?.includes("bloqueada")) {
      console.warn("OMIE RATE LIMIT HIT!");
    }
    throw new Error(error.response?.data?.faultstring || error.message);
  }
}

async function getGoogleAuth() {
  const saPath = path.join(process.cwd(), "service-account.json");
  if (fs.existsSync(saPath)) {
    const saData = JSON.parse(fs.readFileSync(saPath, "utf8"));
    return new JWT({
      email: saData.client_email,
      key: saData.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.readonly"],
    });
  }
  return null;
}

async function debugPedido(numeroPedidoStr: string) {
  const numeroPedidoNormalizado = numeroPedidoStr.trim().toUpperCase();
  
  const debug = {
    pedido: numeroPedidoNormalizado,
    etapaPedidoSeparacao: {
      encontradoNaListaSeparacao: false,
      dadosOriginais: null as any,
      numeroPedidoNormalizado,
      item: "",
      cliente: "",
      dataPedido: ""
    },
    etapaOmie: {
      tentouConsultar: true,
      endpointChamado: "produtos/nfconsultar e servicos/nfse",
      metodoChamado: "ListarNF e ListarNFSE",
      criteriosUsados: {} as any,
      periodoInternoUsado: { dataInicio: "", dataFim: "" },
      respostaBrutaResumo: {} as any,
      retornouErro: false,
      erroOmie: null as string | null,
      encontrouNF: false,
      numeroNFEncontrada: "",
      campoOndePedidoFoiEncontrado: "",
      dadosNfEncontrada: null as any
    },
    etapaPlanilha: {
      tentouConsultar: true,
      planilhaId: SHEET_ID,
      abasVerificadas: ["Myobots - Vendas", "Descartáveis", "Exobots - Vendas"],
      encontrouPedido: false,
      abaEncontrada: "",
      colunaUsadaParaPedido: "",
      dadosEnderecoEncontrados: false,
      dadosClienteEncontrados: false,
      dadosEtiquetaEncontrados: false,
      dadosEncontradosResumo: null as any,
      erroPlanilha: null as string | null
    },
    etapaSerial: {
      exigeSerial: false,
      serialInformado: false,
      serial: "",
      podeProsseguir: false,
      erroSerial: null as string | null
    },
    etapaEtiqueta: {
      tentouGerar: false,
      podeGerar: false,
      gerouComSucesso: false,
      rastreio: "",
      erroEtiqueta: null as string | null
    },
    mensagemFinal: ""
  };

  try {
    const auth = await getGoogleAuth();
    if (!auth) throw new Error("Google Auth falhou.");
    const doc = new GoogleSpreadsheet(SHEET_ID, auth);
    await doc.loadInfo();

    // 1. Etapa de Separação
    const configSeparacao = [
      { aba: "Myobots - Vendas", statusCol: "B", pedidoCol: "C", dataCol: "E", clienteCol: "D" },
      { aba: "Exobots - Vendas", statusCol: "B", pedidoCol: "C", dataCol: "E", clienteCol: "D" },
      { aba: "Descartáveis", statusCol: "P", pedidoCol: "A", dataCol: "C", clienteCol: "B" }
    ];
    for (const item of configSeparacao) {
      const sheet = doc.sheetsByTitle[item.aba];
      if (!sheet) continue;
      const rows = await sheet.getRows();
      const headers = sheet.headerValues;
      const getColIndex = (colLetter: string) => {
        let index = 0;
        for (let i = 0; i < colLetter.length; i++) { index = index * 26 + (colLetter.charCodeAt(i) - 64); }
        return index - 1;
      };
      const iStatus = getColIndex(item.statusCol);
      const iPedido = getColIndex(item.pedidoCol);
      const iData = getColIndex(item.dataCol);
      const iCliente = getColIndex(item.clienteCol);

      for (const row of rows) {
        const p = String(row.get(headers[iPedido]) || "").trim().toUpperCase();
        if (p === numeroPedidoNormalizado || p.includes(numeroPedidoNormalizado) || numeroPedidoNormalizado.includes(p)) {
            debug.etapaPedidoSeparacao.encontradoNaListaSeparacao = true;
            debug.etapaPedidoSeparacao.dadosOriginais = { 
               status: row.get(headers[iStatus]),
               aba: item.aba
            };
            debug.etapaPedidoSeparacao.cliente = row.get(headers[iCliente]);
            debug.etapaPedidoSeparacao.dataPedido = row.get(headers[iData]);
            debug.etapaPedidoSeparacao.item = item.aba;
            break;
        }
      }
      if (debug.etapaPedidoSeparacao.encontradoNaListaSeparacao) break;
    }

    // 2. Etapa Omie
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(fim.getDate() - 90);
    const data_inicio = inicio.toLocaleDateString("pt-BR");
    const data_fim = fim.toLocaleDateString("pt-BR");
    debug.etapaOmie.periodoInternoUsado = { dataInicio: data_inicio, dataFim: data_fim };

    try {
      const param = {
        pagina: 1, registros_por_pagina: 50,
        cNumeroPedido: numeroPedidoNormalizado,
        dEmiInicial: data_inicio, dEmiFinal: data_fim,
        tpNF: "1", tpAmb: "1", filtrar_por_status: "N",
        cDetalhesPedido: "S", cApenasResumo: "N"
      };
      debug.etapaOmie.criteriosUsados = param;
      
      const resposta = await chamarOmie("produtos/nfconsultar", "ListarNF", param);
      debug.etapaOmie.respostaBrutaResumo.produtos = { total_de_registros: resposta.total_de_registros, total_de_paginas: resposta.total_de_paginas };
      
      if (resposta.nfCadastro && resposta.nfCadastro.length > 0) {
        debug.etapaOmie.encontrouNF = true;
        debug.etapaOmie.numeroNFEncontrada = resposta.nfCadastro[0].ide?.nNF;
        debug.etapaOmie.campoOndePedidoFoiEncontrado = "cNumeroPedido (Busca Direta Produtos)";
        debug.etapaOmie.dadosNfEncontrada = {
           ide: resposta.nfCadastro[0].ide,
           pedido: resposta.nfCadastro[0].pedido,
           destinatario: resposta.nfCadastro[0].nfDestInt?.cRazao
        };
      } else {
        // Fallback: search wide (last 90 days)
        const paramWide = { ...param };
        delete paramWide.cNumeroPedido;
        let allNFs: any[] = [];
        try {
            const respWide = await chamarOmie("produtos/nfconsultar", "ListarNF", paramWide);
            allNFs = respWide.nfCadastro || [];
        } catch(e) {
            console.log("Wide search failed:", e);
        }
        const found = allNFs.find((nf: any) => {
           return String(nf.pedido?.cNumPedido || "").trim().toUpperCase() === numeroPedidoNormalizado ||
                  String(nf.pedido?.cNumPedido || "").trim().includes(numeroPedidoNormalizado);
        });
        if (found) {
           debug.etapaOmie.encontrouNF = true;
           debug.etapaOmie.numeroNFEncontrada = found.ide?.nNF;
           debug.etapaOmie.campoOndePedidoFoiEncontrado = "pedido.cNumPedido (Busca Ampla Produtos)";
           debug.etapaOmie.dadosNfEncontrada = { ide: found.ide, pedido: found.pedido };
        }
      }
    } catch (e: any) {
       debug.etapaOmie.retornouErro = true;
       debug.etapaOmie.erroOmie = e.message;
    }

    if (!debug.etapaOmie.encontrouNF) {
       try {
         const paramServ = {
           pagina: 1, registros_por_pagina: 50,
           cNumeroOS: numeroPedidoNormalizado,
           dEmiInicial: data_inicio, dEmiFinal: data_fim
         };
         debug.etapaOmie.criteriosUsados.servicos = paramServ;
         const respServ = await chamarOmie("servicos/nfse", "ListarNFSE", paramServ);
         if (respServ.nfseCadastro && respServ.nfseCadastro.length > 0) {
            debug.etapaOmie.encontrouNF = true;
            debug.etapaOmie.numeroNFEncontrada = respServ.nfseCadastro[0].nNumeroNFSe;
            debug.etapaOmie.campoOndePedidoFoiEncontrado = "cNumeroOS (Busca Direta Serviços)";
            debug.etapaOmie.dadosNfEncontrada = respServ.nfseCadastro[0];
         }
       } catch (e: any) {
         debug.etapaOmie.erroOmie = (debug.etapaOmie.erroOmie ? debug.etapaOmie.erroOmie + " | " : "") + e.message;
       }
    }

    // 3. Etapa Planilha
    const SHEET_ABAS_DATA = [
      { name: "Myobots - Vendas", colPedido: 3, colCliente: 4, colEndereco: 11, colFrete: 10, permiteSerial: true },
      { name: "Exobots - Vendas", colPedido: 3, colCliente: 4, colEndereco: 11, colFrete: 10, permiteSerial: true },
      { name: "Descartáveis", colPedido: 1, colCliente: 2, colEndereco: 15, colFrete: 13, permiteSerial: false },
    ];
    for (const abaInfo of SHEET_ABAS_DATA) {
      const sheet = doc.sheetsByTitle[abaInfo.name];
      if (!sheet) continue;
      const rows = await sheet.getRows();
      const headers = sheet.headerValues;
      for (const row of rows) {
        const ped = String(row.get(headers[abaInfo.colPedido - 1]) || "").trim().toUpperCase();
        if (ped === numeroPedidoNormalizado || (ped.length > 2 && numeroPedidoNormalizado.includes(ped)) || (numeroPedidoNormalizado.length > 2 && ped.includes(numeroPedidoNormalizado))) {
           debug.etapaPlanilha.encontrouPedido = true;
           debug.etapaPlanilha.abaEncontrada = abaInfo.name;
           debug.etapaPlanilha.colunaUsadaParaPedido = headers[abaInfo.colPedido - 1];
           
           const end = String(row.get(headers[abaInfo.colEndereco - 1]) || "").trim();
           const cli = String(row.get(headers[abaInfo.colCliente - 1]) || "").trim();
           const fre = String(row.get(headers[abaInfo.colFrete - 1]) || "").trim();

           debug.etapaPlanilha.dadosEnderecoEncontrados = !!end;
           debug.etapaPlanilha.dadosClienteEncontrados = !!cli;
           debug.etapaPlanilha.dadosEncontradosResumo = { endereco: end, cliente: cli, frete: fre, permiteSerial: abaInfo.permiteSerial };
           break;
        }
      }
      if (debug.etapaPlanilha.encontrouPedido) break;
    }
    if (!debug.etapaPlanilha.encontrouPedido) {
       debug.etapaPlanilha.erroPlanilha = "Pedido não encontrado nas abas.";
    }

    // 4. Etapa Serial
    const serialDoc = new GoogleSpreadsheet(SHEET_SERIAL_ID, auth);
    await serialDoc.loadInfo();
    const enviosSheet = serialDoc.sheetsByTitle["DADOS_DE_ENVIO"];
    if (enviosSheet) {
       const enviosRows = await enviosSheet.getRows();
       const envio = enviosRows.find(r => String(r.get(enviosSheet.headerValues[0]) || "").trim().toUpperCase() === numeroPedidoNormalizado);
       
       debug.etapaSerial.exigeSerial = debug.etapaPlanilha.dadosEncontradosResumo?.permiteSerial || false;
       if (envio) {
          const s = String(envio.get(enviosSheet.headerValues[1]) || "").trim();
          const r = String(envio.get(enviosSheet.headerValues[2]) || "").trim();
          if (s && s !== "nenhum informação") {
             debug.etapaSerial.serialInformado = true;
             debug.etapaSerial.serial = s;
          }
          if (r) {
             debug.etapaEtiqueta.rastreio = r;
             debug.etapaEtiqueta.gerouComSucesso = true;
          }
       }
       debug.etapaSerial.podeProsseguir = !debug.etapaSerial.exigeSerial || debug.etapaSerial.serialInformado;
       if (debug.etapaSerial.exigeSerial && !debug.etapaSerial.serialInformado) {
          debug.etapaSerial.erroSerial = "Aguardando serial para gerar etiqueta.";
       }
    }

    // Mensagem Final
    if (!debug.etapaOmie.encontrouNF && !debug.etapaOmie.retornouErro) {
       debug.mensagemFinal = `Pedido ${numeroPedidoNormalizado} consultado no Omie, mas nenhuma NF foi retornada.`;
    } else if (debug.etapaOmie.retornouErro) {
       debug.mensagemFinal = `Erro Omie ao consultar pedido ${numeroPedidoNormalizado}: ${debug.etapaOmie.erroOmie}`;
    } else if (!debug.etapaPlanilha.encontrouPedido) {
       debug.mensagemFinal = `NF encontrada para pedido ${numeroPedidoNormalizado}, mas pedido não encontrado nas abas da planilha.`;
    } else if (!debug.etapaPlanilha.dadosEnderecoEncontrados) {
       debug.mensagemFinal = `Pedido ${numeroPedidoNormalizado} encontrado na aba ${debug.etapaPlanilha.abaEncontrada}, mas endereço/CEP está incompleto.`;
    } else if (debug.etapaSerial.exigeSerial && !debug.etapaSerial.serialInformado) {
       debug.mensagemFinal = `Aguardando serial para gerar etiqueta.`;
    } else {
       debug.mensagemFinal = "Pedido processado com sucesso";
    }

    return debug;
  } catch (err: any) {
    debug.mensagemFinal = `Erro geral: ${err.message}`;
    return debug;
  }
}

async function run() {
  console.log("== DEBUG PEDIDO 2004 ==");
  const debug2004 = await debugPedido("2004");
  console.log(JSON.stringify(debug2004, null, 2));

  console.log("\n== DEBUG PEDIDO 2008 ==");
  const debug2008 = await debugPedido("2008");
  console.log(JSON.stringify(debug2008, null, 2));
}

run();

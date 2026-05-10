import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import dotenv from "dotenv";
import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Funções de processamento de PDF nativas usando pdf-lib
// processPdfNative substitui o antigo processador Python

const OMIE_APP_KEY = process.env.OMIE_APP_KEY as string;
const OMIE_APP_SECRET = process.env.OMIE_APP_SECRET as string;
const BASE_URL = "https://app.omie.com.br/api/v1";

const SHEET_ID = process.env.SHEET_ID || "1xpTC9L5fNmiqwXh3RjYPmMk-L6EP9exzIB1gg5p2-tc";
const SHEET_SERIAL_ID = process.env.SHEET_SERIAL_ID || "14GL1MIuEY7o1nvnEtgC7-siurYSzcbFBwxC1yQ8J3fc";

// Correios Configuration
const CORREIOS_TOKEN = process.env.CORREIOS_TOKEN as string;
const CORREIOS_CONTRATO = process.env.CORREIOS_CONTRATO as string;
const CORREIOS_CARTAO_POSTAGEM = process.env.CORREIOS_CARTAO_POSTAGEM as string;
const BASE_URL_CORREIOS = "https://api.correios.com.br";

console.log("ENV CHECK", {
  temGoogleCredentials: Boolean(process.env.GOOGLE_CREDENTIALS_JSON),
  temGoogleToken: Boolean(process.env.GOOGLE_TOKEN_JSON),
  temOmieAppKey: Boolean(process.env.OMIE_APP_KEY),
  temOmieAppSecret: Boolean(process.env.OMIE_APP_SECRET)
});

const REMETENTE = {
  nome: "Neurobots",
  cpfCnpj: "24052658000105",
  logradouro: "Avenida Barbosa Lima",
  numero: "149",
  complemento: "",
  bairro: "Recife",
  cidade: "Recife",
  uf: "PE",
  cep: "50030917",
};

// Helper: Adicionar dias úteis
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      added++;
    }
  }
  return result;
}

// Helper: Calcular dias úteis entre datas
function businessDaysDiff(start: Date, end: Date): number {
  let count = 0;
  let cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const target = new Date(end);
  target.setHours(0, 0, 0, 0);

  const isPositive = target >= cur;
  const step = isPositive ? 1 : -1;

  while (cur.getTime() !== target.getTime()) {
    cur.setDate(cur.getDate() + step);
    if (cur.getDay() !== 0 && cur.getDay() !== 6) {
      count += step;
    }
    // Safety break
    if (Math.abs(count) > 1000) break;
  }
  return count;
}

function getCorreiosHeaders() {
  return {
    Authorization: `Bearer ${CORREIOS_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function parseEndereco(texto: string) {
  const result = {
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    uf: "",
    cep: "",
  };

  if (!texto) return result;

  // Extrair CEP
  const cepMatch = texto.match(/CEP\s*[:\-]?\s*([\d]{5}[\-\.]?[\d]{3})/i);
  if (cepMatch) {
    result.cep = cepMatch[1].replace(/\D/g, "");
  }

  // Limpar texto antes do CEP
  const textoLimpo = texto.split(/;?\s*CEP/i)[0].trim().replace(/\.$/, "");
  
  // Dividir por " - "
  let partes = textoLimpo.split(/\s*-\s*/).map(p => p.trim()).filter(Boolean);

  // Cidade / UF costuma ser a última parte
  if (partes.length > 0) {
    const cidadeUfRaw = partes[partes.length - 1];
    const cidadeMatch = cidadeUfRaw.match(/^(.+?)\s*\/\s*([A-Za-z]{2})$/);
    if (cidadeMatch) {
      result.cidade = cidadeMatch[1].trim();
      result.uf = cidadeMatch[2].toUpperCase();
      partes.pop();
    }
  }

  // Bairro costuma ser a penúltima parte (se não tiver números)
  if (partes.length > 0) {
    const possivelBairro = partes[partes.length - 1];
    if (possivelBairro && !/\d/.test(possivelBairro)) {
      result.bairro = possivelBairro;
      partes.pop();
    }
  }

  // Logradouro, Numero, Complemento
  const logradouroRaw = partes.join(" - ").trim();
  const segmentos = logradouroRaw.split(",").map(s => s.trim()).filter(Boolean);

  if (segmentos.length > 0) {
    result.logradouro = segmentos[0];
  }
  if (segmentos.length >= 2) {
    result.numero = segmentos[1];
  }
  if (segmentos.length >= 3) {
    result.complemento = segmentos.slice(2).join(", ");
  }

  // Fallback para número se não houver vírgula
  if (!result.numero && logradouroRaw) {
    const numMatch = logradouroRaw.match(/^(.*?)(?:,?\s+)(\d+[A-Za-z0-9\-/]*)(?:\s+(.*))?$/);
    if (numMatch) {
      result.logradouro = numMatch[1].trim().replace(/[ ,-]+$/, "");
      result.numero = numMatch[2].trim();
      const comp = numMatch[3]?.trim().replace(/[ ,-]+$/, "");
      if (comp) result.complemento = comp;
    }
  }

  return result;
}

app.post("/api/generate-label", async (req, res) => {
  const { nfe, enderecoStr, frete } = req.body;

  try {
    const endereco = parseEndereco(enderecoStr);
    
    const codigoServico = frete?.toUpperCase().includes("SEDEX") ? "03220" : "03298";
    const cnpjDest = (nfe.nfDestInt.cnpj_cpf || "").replace(/\D/g, "");
    const numeroNfe = String(nfe.ide.nNF || "").trim();
    const chaveNfe = String(nfe.compl.cChaveNFe || "").replace(/\D/g, "");

    if (chaveNfe.length !== 44) {
      throw new Error(`Chave da NF-e inválida (deve ter 44 dígitos): ${chaveNfe}`);
    }

    // REGRA OFICIAL DO NEGÓCIO: Baseado no Serial Number ou flag de Artigo Perigoso
    const serial_number = String(nfe.serial || "").trim();
    const isSpecial = !!serial_number || !!nfe.artigo_perigoso;
    console.log(`[PERIGOSO] pedido=${nfe.ide.nNF || nfe.pedido?.cNumPedido || "S/N"} serial='${serial_number}' flag=${nfe.artigo_perigoso} normalizado=${isSpecial}`);

    // Montar itens para declaração de conteúdo
    const itensDeclaracao = nfe.det?.length > 0 ? nfe.det.map((item: any) => ({
      conteudo: "Artigos Médicos",
      descricaoConteudo: "Artigos Médicos",
      descricao: "Artigos Médicos",
      quantidade: Math.max(1, Math.round(item.prod.qCom || 1)),
      valor: Number(item.prod.vProd || 0),
    })) : [{
      conteudo: "Artigos Médicos",
      descricaoConteudo: "Artigos Médicos",
      descricao: "Artigos Médicos",
      quantidade: 1,
      valor: Number(nfe.total.ICMSTot.vNF || 0),
    }];

    const prePostagemBody: any = {
      codigoServico,
      numeroCartaoPostagem: CORREIOS_CARTAO_POSTAGEM,
      codigoFormatoObjetoInformado: "2",
      alturaInformada: "8",
      larguraInformada: "20",
      comprimentoInformado: "28",
      pesoInformado: "300",
      numeroNotaFiscal: numeroNfe,
      chaveNFe: chaveNfe,
      itensDeclaracaoConteudo: itensDeclaracao,
      cienteObjetoNaoProibido: "1",
      remetente: {
        nome: REMETENTE.nome,
        cpfCnpj: REMETENTE.cpfCnpj,
        endereco: {
          cep: REMETENTE.cep.replace(/\D/g, ""),
          logradouro: REMETENTE.logradouro,
          numero: REMETENTE.numero,
          complemento: REMETENTE.complemento,
          bairro: REMETENTE.bairro,
          cidade: REMETENTE.cidade,
          uf: REMETENTE.uf,
        },
      },
      destinatario: {
        nome: nfe.nfDestInt.cRazao,
        cpfCnpj: cnpjDest || "00000000000",
        endereco: {
          cep: endereco.cep.replace(/\D/g, ""),
          logradouro: endereco.logradouro,
          numero: endereco.numero,
          complemento: endereco.complemento,
          bairro: endereco.bairro,
          cidade: endereco.cidade,
          uf: endereco.uf,
        },
      },
    };

    if (isSpecial) {
      prePostagemBody.listaServicoAdicional = ["095"];
    }

    const prePostagemResponse = await axios.post(`${BASE_URL_CORREIOS}/prepostagem/v1/prepostagens`, prePostagemBody, {
      headers: getCorreiosHeaders(),
    });

    const idPre = prePostagemResponse.data.id || prePostagemResponse.data.idPrePostagem;
    let rastreio = prePostagemResponse.data.codigoObjeto || prePostagemResponse.data.codigoRastreio || prePostagemResponse.data.numObj;

    // Se não veio rastreio, tentar consultar
    if (!rastreio && idPre) {
      try {
        const consultResponse = await axios.get(`${BASE_URL_CORREIOS}/prepostagem/v1/prepostagens/${idPre}`, {
          headers: getCorreiosHeaders(),
        });
        rastreio = consultResponse.data.codigoObjeto || consultResponse.data.codigoRastreio || consultResponse.data.numObj;
      } catch (e: any) {
        console.error("Erro ao consultar rastreio:", e.message || e);
      }
    }

    // SALVAR ZPL PARA INSPEÇÃO (OPCIONAL)
    // fs.writeFileSync(path.join(process.cwd(), "last_label_request.json"), JSON.stringify(req.body, null, 2));

    res.json({ success: true, idPre, rastreio: rastreio || "Aguardando..." });
  } catch (error: any) {
    console.error("Erro ao gerar etiqueta nos Correios:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

app.get("/api/download-label/:idPre", async (req, res) => {
  const { idPre } = req.params;

  try {
    // Solicitar PDF
    const rotuloResponse = await axios.post(`${BASE_URL_CORREIOS}/prepostagem/v1/prepostagens/rotulo/assincrono/pdf`, {
      idsPrePostagem: [idPre],
      tipoRotulo: "P",
      formatoRotulo: "ET",
    }, {
      headers: getCorreiosHeaders(),
    });

    const idRecibo = rotuloResponse.data.idRecibo || rotuloResponse.data.recibo || rotuloResponse.data.idSolicitacao || rotuloResponse.data.idReciboRotulo;
    
    // Tentar encontrar PDF direto na resposta
    const findPdfInPayload = (payload: any) => {
      const keys = ["dados", "data", "arquivo", "arquivoBase64", "pdf", "pdfBase64", "conteudo", "conteudoBase64", "rotulo", "rotuloBase64"];
      for (const key of keys) {
        if (payload[key]) return payload[key];
      }
      return null;
    };

    const pdfBase64 = findPdfInPayload(rotuloResponse.data);
    if (pdfBase64) {
      const pdfBuffer = Buffer.from(pdfBase64.replace(/^data:application\/pdf;base64,/, ""), "base64");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="etiqueta_${idPre}.pdf"`);
      return res.send(pdfBuffer);
    }

    if (!idRecibo) {
      throw new Error("Não foi possível obter o recibo para download da etiqueta.");
    }

    // Se for assíncrono, tentar baixar (até 10 tentativas)
    const urlsDownload = [
      (id: string) => `${BASE_URL_CORREIOS}/prepostagem/v1/prepostagens/rotulo/download/assincrono/${id}`,
      (id: string) => `${BASE_URL_CORREIOS}/prepostagem/v1/prepostagens/rotulo/assincrono/pdf/${id}`,
      (id: string) => `${BASE_URL_CORREIOS}/prepostagem/v1/prepostagens/rotulo/download/${id}`,
    ];

    let pdfBuffer: Buffer | null = null;
    let lastError = "";

    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      for (const urlFn of urlsDownload) {
        try {
          const downloadResponse = await axios.get(urlFn(idRecibo), {
            headers: getCorreiosHeaders(),
            responseType: "arraybuffer",
          });
          
          const contentType = String(downloadResponse.headers["content-type"] || "");
          if (downloadResponse.status === 200) {
            if (contentType.includes("application/pdf")) {
              pdfBuffer = Buffer.from(downloadResponse.data);
              break;
            } else {
              // Tentar parsear como JSON se não for PDF
              try {
                const json = JSON.parse(Buffer.from(downloadResponse.data).toString());
                const b64 = findPdfInPayload(json);
                if (b64) {
                  pdfBuffer = Buffer.from(b64.replace(/^data:application\/pdf;base64,/, ""), "base64");
                  break;
                }
              } catch (e) {
                // Não é JSON válido ou não tem PDF
              }
            }
          }
        } catch (e: any) {
          lastError = e.response?.data?.toString() || e.message;
        }
      }
      if (pdfBuffer) break;
    }

    if (pdfBuffer) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="etiqueta_${idPre}.pdf"`);
      res.send(pdfBuffer);
    } else {
      res.status(404).json({ error: `Etiqueta ainda não disponível após 10 tentativas. Último erro: ${lastError}` });
    }
  } catch (error: any) {
    console.error("Erro ao baixar etiqueta:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/["']/g, "").replace(/\\n/g, "\n");

async function getGoogleAuth() {
  // 1. Tentar ler do process.env.GOOGLE_CREDENTIALS_JSON
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    try {
      const saData = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
      return new JWT({
        email: saData.client_email,
        key: saData.private_key,
        scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.readonly"],
      });
    } catch (e: any) {
      console.error("Erro ao fazer parse de GOOGLE_CREDENTIALS_JSON:", e.message || e);
    }
  }

  // 2. Tentar ler do arquivo service-account.json se existir
  const saPath = path.join(process.cwd(), "service-account.json");
  if (fs.existsSync(saPath)) {
    try {
      const saData = JSON.parse(fs.readFileSync(saPath, "utf8"));
      return new JWT({
        email: saData.client_email,
        key: saData.private_key,
        scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.readonly"],
      });
    } catch (e: any) {
      console.error("Erro ao ler service-account.json:", e.message || e);
    }
  }

  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    return null;
  }
  return new JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/drive.readonly"],
  });
}

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

    if (data.faultstring) {
      throw new Error(data.faultstring);
    }

    return data;
  } catch (error: any) {
    console.error(`Erro na API Omie (${call}):`, error.response?.data || error.message);
    throw error;
  }
}

// Endpoint para buscar endereços e requisitos de serial
app.post("/api/sheets-data", async (req, res) => {
  try {
    const auth = await getGoogleAuth();
    if (!auth) {
      return res.status(200).json({ 
        data: {}, 
        warning: "Google Sheets não configurado. Adicione GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_PRIVATE_KEY nos Secrets." 
      });
    }
    const doc = new GoogleSpreadsheet(SHEET_ID, auth);
    await doc.loadInfo();

    const SHEET_ABAS = [
      { name: "Myobots - Vendas", colPedido: 3, colEndereco: 11, colFrete: 10, colObservacoes: 15, permiteSerial: true },
      { name: "Exobots - Vendas", colPedido: 3, colEndereco: 11, colFrete: 10, colObservacoes: 15, permiteSerial: true },
      { name: "Descartáveis", colPedido: 1, colEndereco: 15, colFrete: 13, colObservacoes: 0, permiteSerial: false },
    ];

    const results: Record<string, { endereco: string; frete: string; permiteSerial: boolean; observacoes: string }> = {};
    let dispatchRequestsCount = 0;

    for (const abaInfo of SHEET_ABAS) {
      const sheet = doc.sheetsByTitle[abaInfo.name];
      if (!sheet) continue;

      const rows = await sheet.getRows();
      for (const row of rows) {
        const pedido = String(row.get(sheet.headerValues[abaInfo.colPedido - 1]) || "").trim().toUpperCase();
        const endereco = String(row.get(sheet.headerValues[abaInfo.colEndereco - 1]) || "").trim();
        const frete = String(row.get(sheet.headerValues[abaInfo.colFrete - 1]) || "").trim();
        const observacoes = abaInfo.colObservacoes > 0 
          ? String(row.get(sheet.headerValues[abaInfo.colObservacoes - 1]) || "").trim()
          : "";

        if (pedido && !results[pedido]) {
          results[pedido] = { endereco, frete, permiteSerial: abaInfo.permiteSerial, observacoes };
        }
      }
    }

    res.json({ data: results, dispatchRequestsCount });
  } catch (error: any) {
    console.error("Erro ao acessar Google Sheets:", error);
    res.status(500).json({ error: error.message });
  }
});

// Helper para buscar NF na Omie por número do pedido
let _omieNfCache: { produtos: any[], servicos: any[] } | null = null;
let _omieNfCacheTime: number = 0;

function formatOmieDate(d: Date) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

async function getCachedNFs() {
  const now = Date.now();
  if (_omieNfCache && now - _omieNfCacheTime < 5 * 60 * 1000) { // 5 minutes cache
    return _omieNfCache;
  }
  
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(fim.getDate() - 90);
  const data_inicio = formatOmieDate(inicio);
  const data_fim = formatOmieDate(fim);
  
  let todasProdutos: any[] = [];
  let todasServicos: any[] = [];
  
  try {
    let pagina = 1;
    let total_paginas = 1;
    while (pagina <= total_paginas) {
      const paramProdutos = {
        pagina, registros_por_pagina: 100,
        dEmiInicial: data_inicio, dEmiFinal: data_fim,
        tpNF: "1", tpAmb: "1", filtrar_por_status: "N",
        cDetalhesPedido: "S", cApenasResumo: "N"
      };
      const respProd = await chamarOmie("produtos/nfconsultar", "ListarNF", paramProdutos);
      if (respProd) {
          if (pagina === 1) total_paginas = respProd.total_de_paginas || 1;
          if (respProd.nfCadastro) {
              todasProdutos = todasProdutos.concat(respProd.nfCadastro.map((n: any) => ({ ...n, modulo: 'vendas' })));
          }
      } else {
          break;
      }
      pagina++;
      if (pagina > 20) break; // Safety timeout
    }
  } catch (e: any) {
    console.warn("Erro no cache amplo (Produtos):", e.message);
  }
  
  // Desativado busca de serviços do Omie por solicitação do usuário
  /*
  try {
    let pagina = 1;
    let total_paginas = 1;
    while (pagina <= total_paginas) {
      const paramServ = {
        nPagina: pagina, nRegPorPagina: 100,
        dEmiInicial: data_inicio, dEmiFinal: data_fim
      };
      const respServ = await chamarOmie("servicos/nfse", "ListarNFSEs", paramServ);
      if (respServ) {
          if (pagina === 1) total_paginas = respServ.total_de_paginas || 1;
          if (respServ.nfseCadastro) {
              todasServicos = todasServicos.concat(respServ.nfseCadastro.map((n: any) => ({ 
                ...n, 
                modulo: 'servicos',
                ide: { nNF: n.nNumeroNFSe, dEmi: n.dDataEmissao },
                nfDestInt: { cRazao: n.cRazaoSocialCliente },
                pedido: { cNumPedido: n.cNumeroOS || n.cCodIntOS || "" },
                compl: { nIdNF: n.nCodNFSe },
                det: [{ prod: { xProd: n.cDescricaoServico || "Serviço", qCom: 1, uCom: "UN" } }]
              })));
          }
      } else {
          break;
      }
      pagina++;
      if (pagina > 20) break; // Safety timeout
    }
  } catch (e: any) {
    console.warn("Erro no cache amplo (Serviços):", e.message);
  }
  */
  
  _omieNfCache = { produtos: todasProdutos, servicos: todasServicos };
  _omieNfCacheTime = now;
  console.log(`[Cache Omie] Atualizado. Produtos: ${todasProdutos.length}, Serviços: ${todasServicos.length}`);
  // #region agent log
  try { fs.appendFileSync('debug-cfb5c4.log', JSON.stringify({sessionId:'cfb5c4',location:'server.ts:553',message:'Omie cache built',data:{produtosCount:todasProdutos.length,servicosCount:todasServicos.length,samplePedidosProd:todasProdutos.slice(0,60).map((n:any)=>({ped:n.pedido?.cNumPedido,nNF:n.ide?.nNF,status:n.cabecalho?.cSitNF||n.infProt?.cSitNF||n.protNFe?.infProt?.cStat})),allPedidosProd:todasProdutos.map((n:any)=>String(n.pedido?.cNumPedido||''))},timestamp:Date.now(),hypothesisId:'H1-H2-H3-H4'})+'\n'); } catch(e) {}
  // #endregion
  return _omieNfCache;
}

async function buscarNfePorPedido(numeroPedido: string) {
  const cache = await getCachedNFs();
  const normalized = String(numeroPedido).trim().toUpperCase();
  
  const foundProduto = cache.produtos.find((nf: any) => {
     const ped = String(nf.pedido?.cNumPedido || "").trim().toUpperCase();
     return ped === normalized || (ped.length > 2 && normalized.includes(ped)) || (normalized.length > 2 && ped.includes(normalized));
  });
  if (foundProduto) return foundProduto;
  
  const foundServico = cache.servicos.find((nf: any) => {
     const ped = String(nf.pedido?.cNumPedido || "").trim().toUpperCase();
     return ped === normalized || (ped.length > 2 && normalized.includes(ped)) || (normalized.length > 2 && ped.includes(normalized));
  });
  if (foundServico) return foundServico;
  
  // #region agent log
  try { fs.appendFileSync('debug-cfb5c4.log', JSON.stringify({sessionId:'cfb5c4',location:'server.ts:578',message:'buscarNfePorPedido NOT found',data:{numeroPedido,normalized,cacheSize:{produtos:cache.produtos.length,servicos:cache.servicos.length},closestMatches:cache.produtos.filter((n:any)=>String(n.pedido?.cNumPedido||'').length>0).slice(0,5).map((n:any)=>n.pedido?.cNumPedido)},timestamp:Date.now(),hypothesisId:'H2-H3-H5'})+'\n'); } catch(e) {}
  // #endregion
  return null;
}

let _sheetRowsCache: Record<string, any[]> = {};
let _sheetRowsCacheTime: number = 0;

async function getCachedSheetRows(sheet: any, abaName: string) {
  const now = Date.now();
  if (_sheetRowsCache[abaName] && now - _sheetRowsCacheTime < 60 * 1000) {
    return _sheetRowsCache[abaName];
  }
  const rows = await sheet.getRows();
  _sheetRowsCache[abaName] = rows;
  _sheetRowsCacheTime = now;
  return rows;
}

// Helper para buscar dados do pedido em múltiplas abas da planilha
async function buscarDadosPedidoNasPlanilhas(doc: any, numeroPedido: string) {
  const SHEET_ABAS_DATA = [
    { name: "Myobots - Vendas", colPedido: 3, colCliente: 4, colEndereco: 11, colFrete: 10, colObservacoes: 15, permiteSerial: true },
    { name: "Exobots - Vendas", colPedido: 3, colCliente: 4, colEndereco: 11, colFrete: 10, colObservacoes: 15, permiteSerial: true },
    { name: "Descartáveis", colPedido: 1, colCliente: 2, colEndereco: 15, colFrete: 13, colObservacoes: 0, permiteSerial: false },
  ];

  const searchResults: any = {
    encontrado: false,
    abaEncontrada: null,
    dados: null,
    abasVerificadas: [],
    erro: null,
    detalhes: []
  };

  const normalizedPedido = String(numeroPedido).trim().toUpperCase();

  for (const abaInfo of SHEET_ABAS_DATA) {
    searchResults.abasVerificadas.push(abaInfo.name);
    const sheet = doc.sheetsByTitle[abaInfo.name];
    if (!sheet) {
      searchResults.detalhes.push(`${abaInfo.name}: Aba não encontrada no documento.`);
      continue;
    }

    try {
      const rows = await getCachedSheetRows(sheet, abaInfo.name);
      const headers = sheet.headerValues;
      
      let foundInThisSheet = false;
      for (const row of rows) {
        const pedidoNaPlanilhaRaw = row.get(headers[abaInfo.colPedido - 1]);
        const pedidoNaPlanilha = String(pedidoNaPlanilhaRaw || "").trim().toUpperCase();

        // Comparação robusta: igualdade exata ou inclusão mútua (para lidar com prefixos/sufixos)
        if (pedidoNaPlanilha === normalizedPedido || 
            (pedidoNaPlanilha.length > 2 && normalizedPedido.includes(pedidoNaPlanilha)) || 
            (normalizedPedido.length > 2 && pedidoNaPlanilha.includes(normalizedPedido))) {
          
          const rawEndereco = row.get(headers[abaInfo.colEndereco - 1]);
          const endereco = String(rawEndereco || "").trim();
          const frete = String(row.get(headers[abaInfo.colFrete - 1]) || "").trim();
          const cliente = String(row.get(headers[abaInfo.colCliente - 1]) || "").trim();
          const observacoes = abaInfo.colObservacoes > 0 
            ? String(row.get(headers[abaInfo.colObservacoes - 1]) || "").trim()
            : "";

          searchResults.encontrado = true;
          searchResults.abaEncontrada = abaInfo.name;
          searchResults.dados = {
            endereco,
            frete,
            cliente,
            permiteSerial: abaInfo.permiteSerial,
            observacoes
          };
          foundInThisSheet = true;
          searchResults.detalhes.push(`${abaInfo.name}: Pedido ${numeroPedido} encontrado.`);
          break;
        }
      }
      if (foundInThisSheet) return searchResults;
      searchResults.detalhes.push(`${abaInfo.name}: Pedido ${numeroPedido} não encontrado.`);
    } catch (e: any) {
      searchResults.detalhes.push(`${abaInfo.name}: Erro ao ler aba - ${e.message}`);
    }
  }

  searchResults.erro = `Pedido ${numeroPedido} não localizado nas planilhas: ${searchResults.abasVerificadas.join(", ")}`;
  return searchResults;
}

// Endpoint para buscar pedidos em separação da planilha
app.get("/api/pedidos-expedir", async (req, res) => {
  try {
    const auth = await getGoogleAuth();
    if (!auth) {
      return res.status(400).json({ error: "Google Sheets não configurado." });
    }

    const doc = new GoogleSpreadsheet(SHEET_ID, auth);
    await doc.loadInfo();

    const config = [
      { aba: "Myobots - Vendas", statusCol: "B", pedidoCol: "C", dataCol: "E", clienteCol: "D", prazoDias: 7, permiteSerial: true },
      { aba: "Exobots - Vendas", statusCol: "B", pedidoCol: "C", dataCol: "E", clienteCol: "D", prazoDias: 20, permiteSerial: true },
      { aba: "Descartáveis", statusCol: "P", pedidoCol: "A", dataCol: "C", clienteCol: "B", prazoDias: 4, permiteSerial: false }
    ];

    const spreadsheetOrdersRaw: any[] = [];
    const now = new Date();

    for (const item of config) {
      const sheet = doc.sheetsByTitle[item.aba];
      if (!sheet) continue;

      const rows = await sheet.getRows();
      const headers = sheet.headerValues;
      const getColIndex = (colLetter: string) => {
        let index = 0;
        for (let i = 0; i < colLetter.length; i++) {
          index = index * 26 + (colLetter.charCodeAt(i) - 64);
        }
        return index - 1;
      };

      const iStatus = getColIndex(item.statusCol);
      const iPedido = getColIndex(item.pedidoCol);
      const iData = getColIndex(item.dataCol);
      const iCliente = getColIndex(item.clienteCol);
      const iObs = headers.findIndex(h => h && (h.toUpperCase() === "OBSERVAÇÕES" || h.toUpperCase() === "OBSERVACOES" || h.toUpperCase() === "OBS"));

      for (const row of rows) {
        const status = (row.get(headers[iStatus]) || "").trim();
        if (status === "Em separação") {
          const rawDate = row.get(headers[iData]);
          const numPedidoRaw = row.get(headers[iPedido]);
          const numPedido = String(numPedidoRaw || "").trim();
          const cliente = String(row.get(headers[iCliente]) || "").trim();
          const realObs = iObs !== -1 ? (row.get(headers[iObs]) || "").trim() : "";
          
          if (!numPedido) continue;

          let dateObj: Date | null = null;
          if (typeof rawDate === "number") {
            dateObj = new Date((rawDate - 25569) * 86400 * 1000);
          } else if (typeof rawDate === "string") {
            const parts = rawDate.split("/");
            if (parts.length === 3) {
              dateObj = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
            } else {
              dateObj = new Date(rawDate);
            }
          }
          if (!dateObj || isNaN(dateObj.getTime())) continue;

          const deadline = addBusinessDays(dateObj, item.prazoDias);
          const daysLeft = businessDaysDiff(now, deadline);
          let priority = "Baixa prioridade";
          let priorityScore = 4;
          if (deadline < now && now.toDateString() !== deadline.toDateString()) {
            priority = "Atrasado";
            priorityScore = 1;
          } else if (daysLeft <= 0) {
            priority = "Crítico";
            priorityScore = 1;
          } else if (daysLeft <= 1) {
            priority = "Alta prioridade";
            priorityScore = 2;
          } else if (daysLeft <= 3) {
            priority = "Média prioridade";
            priorityScore = 3;
          }

          spreadsheetOrdersRaw.push({
            origem: item.aba,
            cliente,
            numPedido,
            dateObj,
            priority,
            priorityScore,
            deadline,
            daysLeft,
            permiteSerial: item.permiteSerial,
            realObs
          });
        }
      }
    }

    // PROCESSAMENTO UNIFICADO: Cruzar pedidos da planilha com Omie
    const allOrders: any[] = [];
    
    // Buscar dados de envios já realizados (serial/rastreio)
    const serialDoc = new GoogleSpreadsheet(SHEET_SERIAL_ID, auth);
    await serialDoc.loadInfo();
    const enviosSheet = serialDoc.sheetsByTitle["DADOS_DE_ENVIO"];
    const enviosMap: Record<string, { serial: string; rastreio: string }> = {};
    if (enviosSheet) {
      const enviosRows = await enviosSheet.getRows();
      enviosRows.forEach(row => {
        const pedido = String(row.get("Pedido") || row.get(enviosSheet.headerValues[0]) || "").trim().toUpperCase();
        const serial = String(row.get("Serial") || row.get(enviosSheet.headerValues[1]) || "").trim();
        const rastreio = String(row.get("Rastreio") || row.get(enviosSheet.headerValues[2]) || "").trim();
        if (pedido && !enviosMap[pedido]) {
          enviosMap[pedido] = { serial, rastreio };
        }
      });
    }

    for (const raw of spreadsheetOrdersRaw) {
      const debugEtapas: any = {
        pedido: raw.numPedido,
        omie: { consultado: true, encontrado: false, nf: null, erro: null },
        planilha: { consultado: true, encontrado: false, abasVerificadas: [], abaEncontrada: null, erro: null, detalhes: [] },
        etiqueta: { tentouGerar: false, sucesso: false, erro: null }
      };

      let finalOrder: any = null;
      
      try {
        const omieNfe = await buscarNfePorPedido(raw.numPedido);
        // #region agent log
        try { fs.appendFileSync('debug-cfb5c4.log', JSON.stringify({sessionId:'cfb5c4',location:'server.ts:800',message:'pedido-expedir omie lookup',data:{numPedido:raw.numPedido,found:!!omieNfe,nNF:omieNfe?.ide?.nNF,nIdNF:omieNfe?.compl?.nIdNF},timestamp:Date.now(),hypothesisId:'H1-H5'})+'\n'); } catch(e) {}
        // #endregion
        if (omieNfe) {
          debugEtapas.omie.encontrado = true;
          debugEtapas.omie.nf = omieNfe.ide?.nNF || omieNfe.nfseCadastro?.[0]?.nNumeroNFSe || "Encontrada";
          finalOrder = { ...omieNfe };
          finalOrder.status = "NF Emitida";
        } else {
          debugEtapas.omie.erro = "Pedido não encontrado no Omie (Produtos ou Serviços)";
          finalOrder = {
            compl: { nIdNF: Math.floor(Math.random() * 1000000) },
            ide: { dEmi: raw.dateObj.toLocaleDateString("pt-BR"), nNF: "" },
            pedido: { cNumPedido: raw.numPedido },
            nfDestInt: { cRazao: raw.cliente, cnpj_cpf: "" },
            det: [{ prod: { xProd: raw.origem.includes("Exobots") ? "Exobots" : (raw.origem.includes("Myobots") ? "Myobots" : raw.origem), qCom: 1, uCom: "UN" } }],
            total: { ICMSTot: { vNF: 0 } },
            modulo: 'vendas',
            status: `Pedido aguardando faturamento`
          };
        }
      } catch (err: any) {
        debugEtapas.omie.erro = err.message || "Erro na API Omie";
        finalOrder = {
          compl: { nIdNF: Math.floor(Math.random() * 1000000) },
          ide: { dEmi: raw.dateObj.toLocaleDateString("pt-BR"), nNF: "" },
          pedido: { cNumPedido: raw.numPedido },
          nfDestInt: { cRazao: raw.cliente, cnpj_cpf: "" },
          det: [{ prod: { xProd: "Erro Omie", qCom: 1, uCom: "UN" } }],
          total: { ICMSTot: { vNF: 0 } },
          status: `Erro Omie no pedido ${raw.numPedido}: ${err.message}`
        };
      }

      // ENRIQUECIMENTO COM DADOS DA PLANILHA (PROCURAR NAS 3 ABAS)
      const sheetResult = await buscarDadosPedidoNasPlanilhas(doc, raw.numPedido);
      debugEtapas.planilha.encontrado = sheetResult.encontrado;
      debugEtapas.planilha.abasVerificadas = sheetResult.abasVerificadas;
      debugEtapas.planilha.abaEncontrada = sheetResult.abaEncontrada;
      debugEtapas.planilha.erro = sheetResult.erro;
      debugEtapas.planilha.detalhes = sheetResult.detalhes;

      if (sheetResult.encontrado && sheetResult.dados) {
        finalOrder.endereco = sheetResult.dados.endereco;
        finalOrder.frete = sheetResult.dados.frete;
        finalOrder.permiteSerial = sheetResult.dados.permiteSerial;
        finalOrder.observacoes = sheetResult.dados.observacoes || raw.realObs;
        
        // Se a NF do Omie não tiver o cliente correto (ou se for fallback), usa o da planilha
        if (sheetResult.dados.cliente && (!finalOrder.nfDestInt.cRazao || finalOrder.nfDestInt.cRazao === raw.cliente)) {
          finalOrder.nfDestInt.cRazao = sheetResult.dados.cliente;
        }

        if (!finalOrder.endereco) {
          finalOrder.status = `Aba ${sheetResult.abaEncontrada}: Endereço incompleto.`;
          debugEtapas.etiqueta.erro = "Endereço vazio na planilha";
        }
      } else {
        if (debugEtapas.omie.encontrado) {
          finalOrder.status = `NF encontrada, mas pedido ${raw.numPedido} não localizado em Myobots, Descartáveis ou Exobots.`;
        }
      }

      // ADICIONAR METADADOS DE SEPARAÇÃO/PRIORIDADE
      finalOrder.origem = raw.origem;
      finalOrder.priority = raw.priority;
      finalOrder.priorityScore = raw.priorityScore;
      finalOrder.deadline = raw.deadline.toLocaleDateString("pt-BR");
      finalOrder.daysLeft = raw.daysLeft;
      finalOrder.dataPedido = raw.dateObj.toLocaleDateString("pt-BR");
      finalOrder.isSpreadsheet = true;
      finalOrder.debugEtapas = debugEtapas;

      // CRUZAR COM DADOS DE ENVIO JÁ REALIZADOS
      const envioInfo = enviosMap[raw.numPedido.toUpperCase()];
      if (envioInfo) {
        finalOrder.serial = envioInfo.serial !== "nenhum informação" ? envioInfo.serial : "";
        finalOrder.rastreio = envioInfo.rastreio;
        if (finalOrder.serial) finalOrder.serialSaved = true;
        if (finalOrder.rastreio) {
          finalOrder.labelStatus = 'success';
          finalOrder.serialSaved = true;
        }
      }

      // Validação de Serial para etiquetas
      if (finalOrder.permiteSerial && !finalOrder.serial && finalOrder.status === "NF Emitida") {
        finalOrder.status = "Aguardando número de série";
      }

      allOrders.push(finalOrder);
    }

    // Desativado busca de pedidos em separação diretamente da Omie (Serviços/OS) por solicitação do usuário
    /*
    try {
      const respOS = await chamarOmie("servicos/os", "ListarOS", { pagina: 1, registros_por_pagina: 100 });
      if (respOS && respOS.osCadastro) {
        const omieOrders = respOS.osCadastro
          .filter((os: any) => os.Cabecalho?.cEtapa === "10")
          .map((os: any) => {
            const numPedido = os.Cabecalho?.cNumOS || "";
            // Evitar duplicar se já foi lido da planilha
            if (allOrders.some(o => o.pedido?.cNumPedido === numPedido)) {
              return null;
            }
            
            let dateObj = new Date();
            const rawDate = os.Cabecalho?.dDtOS;
            if (rawDate) {
              const parts = rawDate.split("/");
              if (parts.length === 3) {
                dateObj = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
              } else {
                dateObj = new Date(rawDate);
              }
            }
            
            const deadline = addBusinessDays(dateObj, 7); // Default 7 dias
            const daysLeft = businessDaysDiff(new Date(), deadline);
            
            return {
              compl: { nIdNF: os.Cabecalho?.cCodIntOS },
              ide: { dEmi: os.Cabecalho?.dDtOS, nNF: "" },
              pedido: { cNumPedido: numPedido },
              nfDestInt: { cRazao: "Cliente ID " + os.Cabecalho?.nCodCli, cnpj_cpf: "" },
              det: [{ prod: { xProd: "Serviço (Omie)", qCom: 1, uCom: "UN" } }],
              total: { ICMSTot: { vNF: 0 } },
              modulo: "servicos",
              status: "Em separação",
              origem: "Omie",
              priority: "Média prioridade",
              priorityScore: 3,
              deadline: deadline.toLocaleDateString("pt-BR"),
              daysLeft: daysLeft,
              dataPedido: dateObj.toLocaleDateString("pt-BR"),
              isSpreadsheet: false,
              isOmieOnly: true,
              debugEtapas: {
                pedido: numPedido,
                omie: { consultado: true, encontrado: true, nf: null, erro: null },
                planilha: { consultado: false, encontrado: false, abasVerificadas: [], abaEncontrada: null, erro: null, detalhes: [] },
                etiqueta: { tentouGerar: false, sucesso: false, erro: null }
              }
            };
          })
          .filter((o: any) => o !== null);
          
        allOrders.push(...omieOrders);
      }
    } catch (e: any) {
      console.error("Erro ao buscar pedidos em separação da Omie:", e);
    }
    */

    // Ordenação: prioridade, depois deadline
    allOrders.sort((a, b) => {
      if (a.priorityScore !== b.priorityScore) {
        return a.priorityScore - b.priorityScore;
      }
      const dateA = new Date(a.deadline.split("/").reverse().join("-")).getTime();
      const dateB = new Date(b.deadline.split("/").reverse().join("-")).getTime();
      return dateA - dateB;
    });

    res.json({ orders: allOrders });
  } catch (error: any) {
    console.error("Erro ao buscar pedidos em separação:", error);
    res.status(500).json({
      error: "Erro interno em /api/pedidos-expedir",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Endpoint para salvar seriais e rastreio
app.post("/api/save-serials", async (req, res) => {
  const { serials, operatorName } = req.body; // Array de { pedido, serial, rastreio } e nome do operador

  try {
    const auth = await getGoogleAuth();
    if (!auth) throw new Error("Google Auth não configurado.");
    
    const doc = new GoogleSpreadsheet(SHEET_SERIAL_ID, auth);
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle["DADOS_DE_ENVIO"] || doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    
    for (const s of serials) {
      const pedido = String(s.pedido || "").trim().toUpperCase();
      const serial = s.serial || "nenhum informação";
      const rastreio = s.rastreio || "";
      const itens = s.itens || "";
      
      const dataAtual = new Date();
      const formattedDate = `${String(dataAtual.getDate()).padStart(2, '0')}/${String(dataAtual.getMonth() + 1).padStart(2, '0')}/${dataAtual.getFullYear()}`;
      
      const existingRow = rows.find(r => {
        const rowPedido = String(r.get("Pedido") || r.get(sheet.headerValues[0]) || "").trim().toUpperCase();
        return rowPedido === pedido;
      });

      if (existingRow) {
        // Atualizar linha existente
        const headerPedido = sheet.headerValues[0] || "Pedido";
        const headerSerial = sheet.headerValues[1] || "Serial";
        const headerRastreio = sheet.headerValues[2] || "Rastreio";
        const headerOperador = sheet.headerValues[3] || "Operador";
        const headerDataExpedicao = sheet.headerValues[10] || "Data de Expedicao"; // Coluna K
        const headerItens = sheet.headerValues[11] || "Itens do Pedido"; // Coluna L

        existingRow.set(headerSerial, serial);
        // Só atualiza o rastreio se ele for fornecido (não sobrescrever com vazio se já tiver)
        if (rastreio) {
          existingRow.set(headerRastreio, rastreio);
        }
        existingRow.set(headerOperador, operatorName || "");
        existingRow.set(headerDataExpedicao, formattedDate);
        if (itens) {
          existingRow.set(headerItens, itens);
        }
        
        await existingRow.save();
        console.log(`[SHEET_UPDATE] Pedido ${pedido} atualizado com data ${formattedDate} e itens.`);
      } else {
        // Adicionar nova linha preenchendo até a coluna L (índice 11)
        const newRowArray = [
          pedido,                // A: 0
          serial,                // B: 1
          rastreio,              // C: 2
          operatorName || "",    // D: 3
          "",                    // E: 4
          "",                    // F: 5
          "",                    // G: 6
          "",                    // H: 7
          "",                    // I: 8
          "",                    // J: 9
          formattedDate,         // K: 10
          itens                  // L: 11
        ];
        await sheet.addRow(newRowArray);
        console.log(`[SHEET_INSERT] Pedido ${pedido} inserido com data ${formattedDate} e itens.`);
      }
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Erro ao salvar na planilha:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para listar NF-es
app.post("/api/nfes", async (req, res) => {
  const { data_inicio, data_fim } = req.body;

  try {
    let todasProdutos: any[] = [];
    let todasServicos: any[] = [];
    
    // 1. Buscar NF-e de Produtos (Vendas e NF-e)
    try {
      let pagina = 1;
      let total_paginas = 1;
      while (pagina <= total_paginas) {
        const param = {
          pagina,
          registros_por_pagina: 50,
          ordenar_por: "CODIGO",
          ordem_decrescente: "N",
          dEmiInicial: data_inicio,
          dEmiFinal: data_fim,
          tpNF: "1",
          tpAmb: "1",
          filtrar_por_status: "N",
          cDetalhesPedido: "S",
          cApenasResumo: "N",
        };

        const resposta = await chamarOmie("produtos/nfconsultar", "ListarNF", param);
        
        if (pagina === 1) {
          total_paginas = resposta.total_de_paginas || 1;
        }

        const nfes_pagina = (resposta.nfCadastro || []).map((n: any) => ({ ...n, modulo: 'vendas' }));
        todasProdutos = [...todasProdutos, ...nfes_pagina];
        pagina++;
      }
    } catch (omieError) {
      console.error("Erro ao listar NF-es de Produtos da Omie:", omieError);
    }

    // 2. Buscar NFS-e de Serviços (Serviços e NF-e)
    try {
      let pagina = 1;
      let total_paginas = 1;
      while (pagina <= total_paginas) {
        const param = {
          nPagina: pagina,
          nRegPorPagina: 50,
          dEmiInicial: data_inicio,
          dEmiFinal: data_fim,
        };

        const resposta = await chamarOmie("servicos/nfse", "ListarNFSEs", param);
        
        if (pagina === 1) {
          total_paginas = resposta.total_de_paginas || 1;
        }

        const nfse_pagina = (resposta.nfseCadastro || []).map((n: any) => ({ 
          ...n, 
          modulo: 'servicos',
          // Normalizar para o formato que o frontend espera (ide, nfDestInt, etc)
          ide: {
            nNF: n.nNumeroNFSe,
            dEmi: n.dDataEmissao
          },
          nfDestInt: {
            cRazao: n.cRazaoSocialCliente
          },
          pedido: {
            cNumPedido: n.cNumeroOS || n.cCodIntOS || ""
          },
          compl: {
            nIdNF: n.nCodNFSe
          },
          det: [{
            prod: {
              xProd: n.cDescricaoServico || "Serviço",
              qCom: 1,
              uCom: "UN"
            }
          }]
        }));
        todasServicos = [...todasServicos, ...nfse_pagina];
        pagina++;
      }
    } catch (omieError) {
      console.error("Erro ao listar NFS-es de Serviços da Omie:", omieError);
    }

    let todas = [...todasProdutos, ...todasServicos];

    // Adicionar solicitações manuais de despacho e dados de envio
    try {
      const auth = await getGoogleAuth();
      if (auth) {
        const serialDoc = new GoogleSpreadsheet(SHEET_SERIAL_ID, auth);
        await serialDoc.loadInfo();

        // 1. Buscar dados de envios já realizados (DADOS_DE_ENVIO)
        const enviosSheet = serialDoc.sheetsByTitle["DADOS_DE_ENVIO"];
        const enviosMap: Record<string, { serial: string; rastreio: string }> = {};
        if (enviosSheet) {
          const enviosRows = await enviosSheet.getRows();
          enviosRows.forEach(row => {
            const pedido = String(row.get("Pedido") || row.get(enviosSheet.headerValues[0]) || "").trim().toUpperCase();
            const serial = String(row.get("Serial") || row.get(enviosSheet.headerValues[1]) || "").trim();
            const rastreio = String(row.get("Rastreio") || row.get(enviosSheet.headerValues[2]) || "").trim();
            if (pedido && !enviosMap[pedido]) {
              enviosMap[pedido] = { serial, rastreio };
            }
          });
        }

        // 2. Associar dados de envios já realizados às NF-es
        todas.forEach(nfe => {
          const pedido = String(nfe.pedido?.cNumPedido || "").trim().toUpperCase();
          if (pedido && enviosMap[pedido]) {
            const info = enviosMap[pedido];
            nfe.serial = info.serial !== "nenhum informação" ? info.serial : "";
            nfe.rastreio = info.rastreio;
            
            if (nfe.serial) {
              nfe.serialSaved = true;
            }
            
            if (nfe.rastreio) {
              nfe.labelStatus = 'success';
              nfe.serialSaved = true; // Garantir que se tem rastreio, o serial (mesmo vazio) é considerado salvo
            }
          }
        });
      }
    } catch (sheetError) {
      console.error("Erro ao buscar solicitações manuais e dados de envio:", sheetError);
    }

    res.json({ nfes: todas });
  } catch (error: any) {
    res.status(500).json({
      error: "Erro interno em /api/nfes",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

// Endpoint para buscar pedidos "Em separação" na Omie (usando OS como exemplo)
app.get("/api/pedidos-separacao", async (req, res) => {
  try {
    const param = {
      pagina: 1,
      registros_por_pagina: 100,
    };
    const resp = await chamarOmie("servicos/os", "ListarOS", param);
    const pedidos = (resp?.osCadastro || [])
      .filter((os: any) => os.Cabecalho?.cEtapa === "10")
      .map((os: any) => ({
        compl: { nIdNF: os.Cabecalho?.cCodIntOS },
        ide: { dEmi: os.Cabecalho?.dDtOS, nNF: "" },
        pedido: { cNumPedido: os.Cabecalho?.cNumOS },
        nfDestInt: { cRazao: "Cliente ID " + os.Cabecalho?.nCodCli, cnpj_cpf: "" }, // ID como fallback
        det: [{ prod: { xProd: "Serviço/Produto", qCom: 1, uCom: "UN" } }],
        total: { ICMSTot: { vNF: 0 } },
        modulo: "servicos",
        status: "Em separação",
        isOmieOnly: true // Flag para diferenciar
      }));
    res.json({ orders: pedidos });
  } catch (error: any) {
    console.error("Erro ao listar pedidos em separação:", error);
    res.status(500).json({ error: error.message });
  }
});

// Função para detectar a área útil da etiqueta usando renderização e Sharp
// REMOVIDA pois não é mais necessária (usuário quer arquivos brutos)

// Função para converter imagem em ZPL ^GFA
async function imageToZplGfa(imagePath: string, width: number, height: number): Promise<string> {
  if (!fs.existsSync(imagePath)) {
    // Retorna um placeholder (caixa preta 100x100) se a imagem não existir
    const bytesPerRow = Math.ceil(width / 8);
    const totalBytes = bytesPerRow * height;
    const hexData = "F".repeat(totalBytes * 2); // Caixa preta
    return `^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hexData}`;
  }

  try {
    const sharp = (await import("sharp")).default;
    const monochrome = await sharp(imagePath)
      .resize(width, height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .toColorspace('b-w')
      .threshold(128)
      .raw()
      .toBuffer();

    const bytesPerRow = Math.ceil(width / 8);
    const totalBytes = bytesPerRow * height;
    let hexData = "";
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < bytesPerRow; x++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const pixelX = x * 8 + bit;
          if (pixelX < width) {
            const pixelValue = monochrome[y * width + pixelX];
            if (pixelValue < 128) { // Pixel preto
              byte |= (1 << (7 - bit));
            }
          }
        }
        hexData += byte.toString(16).padStart(2, '0').toUpperCase();
      }
    }
    return `^GFA,${totalBytes},${totalBytes},${bytesPerRow},${hexData}`;
  } catch (e) {
    console.error("Erro ao converter imagem para ZPL:", e);
    return "";
  }
}

// Função para gerar ZPL para Elgin L42 Pro / Zebra
async function generateZplString(data: any): Promise<string> {
  const { omie, correios } = data;
  
  // LOGS EXPLICITOS PARA DIAGNÓSTICO
  const identificador = omie.nf_numero || correios.nf || "S/N";
  const serial_number = String(omie.serial_number || "").trim();
  const produto_perigoso = !!serial_number || !!correios.artigo_perigoso;
  console.log(`[PERIGOSO] pedido=${identificador} serial='${serial_number}' flag_ap=${correios.artigo_perigoso} normalizado=${produto_perigoso}`);
  console.log(`[ETIQUETA] pedido=${identificador} qr_centralizado=True ap=${produto_perigoso}`);

  // Helper to remove accents and special chars for ZPL
  const clean = (str: string) => {
    if (!str) return "";
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[ºª]/g, ".")
      .replace(/ç/g, "c")
      .replace(/Ç/g, "C")
      .trim();
  };

  const formatChave = (chave: string) => {
    const cleanChave = (chave || "").replace(/\D/g, "");
    return cleanChave.match(/.{1,4}/g)?.join(" ") || cleanChave;
  };

  // LABEL 1: DANFE SIMPLIFICADA
  let zpl = "^XA^CI28^MMT,Y^MNW^MTD^MD15^PR4,4\n";
  zpl += "^FO20,20^GB772,1178,3^FS\n"; // Borda externa

  // Título
  zpl += "^FO20,30^A0N,40,40^FB772,1,C,0^FD" + clean("DANFE SIMPLIFICADO - ETIQUETA") + "^FS\n";

  // Código de barras da chave (Movido para cima: Y=70)
  const chaveLimpa = (omie.nf_chave || "").replace(/\D/g, "");
  zpl += "^BY2,2,100\n";
  zpl += "^FO95,70^BCN,100,N,N,N,A^FD" + chaveLimpa + "^FS\n";

  // Texto da chave
  const chaveFormatada = formatChave(omie.nf_chave);
  zpl += "^FO40,205^A0N,20,20^FDChave de Acesso:^FS\n";
  zpl += "^FO40,230^A0N,20,20^FB732,2,L,0^FD" + clean(chaveFormatada) + "^FS\n";

  // Protocolo
  zpl += "^FO40,285^A0N,22,22^FDProtocolo de Autorizacao: " + clean(omie.nf_protocolo) + "^FS\n";

  // Tipo / Número / Série
  zpl += "^FO40,320^A0N,22,22^FDTipo NF: " + clean(omie.nf_tipo || "1 - SAIDA") + "  Numero NF: " + clean(omie.nf_numero) + "  Serie: " + clean(omie.nf_serie) + "^FS\n";

  // Data de emissão somente
  zpl += "^FO40,350^A0N,22,22^FDData Emissao: " + clean(omie.nf_data) + "^FS\n";

  // Bloco EMITENTE
  zpl += "^FO20,385^GB772,30,30^FS^FO30,390^A0N,22,22^FR^FDEMITENTE^FS\n";
  zpl += "^FO40,425^A0N,20,20^FB732,2,L,0^FDNome: " + clean(omie.emitente.nome) + "^FS\n";
  zpl += "^FO40,455^A0N,20,20^FDCNPJ: " + clean(omie.emitente.cnpj) + "  IE: " + clean(omie.emitente.ie) + "^FS\n";
  zpl += "^FO40,480^A0N,20,20^FDFone: " + clean(omie.emitente.fone) + "^FS\n";
  zpl += "^FO40,505^A0N,20,20^FDEndereco: " + clean(omie.emitente.endereco) + "^FS\n";
  zpl += "^FO40,530^A0N,20,20^FDCidade: " + clean(omie.emitente.cidade) + "^FS\n";

  // Bloco DESTINATARIO/REMETENTE
  const destNome1 = clean(omie.destinatario.nome);
  const fontSize1 = destNome1.length > 39 ? 18 : 22;
  zpl += "^FO20,565^GB772,30,30^FS^FO30,570^A0N,22,22^FR^FDDESTINATARIO/REMETENTE^FS\n";
  zpl += `^FO40,605^A0N,${fontSize1},${fontSize1}^FB732,2,L,0^FDNome: ${destNome1}^FS\n`;
  zpl += "^FO40,650^A0N,22,22^FDCNPJ/CPF: " + clean(omie.destinatario.doc) + "^FS\n";
  zpl += "^FO40,675^A0N,22,22^FDEndereco: " + clean(omie.destinatario.endereco) + "^FS\n";
  zpl += "^FO40,700^A0N,22,22^FDCidade: " + clean(omie.destinatario.cidade) + "^FS\n";

  // Rodapé: Product Number
  if (omie.serial_number) {
    zpl += "^FO20,1070^GB772,30,30^FS^FO30,1075^A0N,22,22^FR^FDPRODUCT NUMBER^FS\n";
    zpl += "^FO20,1100^GB772,45,2^FS\n";
    zpl += "^FO40,1110^A0N,28,28^FDProduct Number: " + clean(omie.serial_number) + "^FS\n";
  }

  zpl += "^XZ\n";

  // LABEL 2: ETIQUETA CORREIOS
  zpl += "^XA^CI28^MMT,Y^MNW^MTD^MD15^PR4,4\n";
  zpl += "^FO20,20^GB772,1178,3^FS\n"; // Outer box
  
  // Logo da Empresa (Placeholder ou GFA)
  const logoPath = path.join(process.cwd(), "logo.png");
  if (fs.existsSync(logoPath)) {
    const logoGfa = await imageToZplGfa(logoPath, 200, 100);
    zpl += `^FO40,40${logoGfa}^FS\n`;
  } else {
    // Fallback se não houver imagem
    zpl += "^FO40,40^A0N,40,40^FDNEUROBOTS^FS\n"; 
  }
  
  // QR code centralizado (X=330 para 812 total, Y=15 para ficar mais alto)
  zpl += "^FO330,15^BQN,2,5^FDQA," + (correios.rastreio || "").replace(/\s/g, "") + "^FS\n";

  // Simbolo SEDEX/PAC (Restaurado)
  zpl += "^FO650,40^GC100,3,B^FS\n";
  zpl += "^FO685,75^A0N,40,40^FD" + (correios.servico?.toUpperCase().includes("SEDEX") ? "S" : "P") + "^FS\n";

  // Linha de contrato e serviço
  zpl += "^FO40,220^A0N,24,24^FDContrato: " + clean(correios.contrato) + "  " + clean(correios.servico) + "^FS\n";
  
  // Rastreio Grande
  zpl += "^FO40,260^A0N,54,54^FD" + clean(correios.rastreio) + "^FS\n";
  
  // NF
  zpl += "^FO610,265^A0N,28,28^FDNF: " + clean(correios.nf) + "^FS\n";

  // BLOCO AP (Abaixo da NF)
  if (produto_perigoso) {
    zpl += "^FO620,305^GB80,45,3^FS\n";
    zpl += "^FO642,312^A0N,32,32^FDAP^FS\n";
  }
  
  // Barcode Rastreio
  zpl += "^BY3,3,90^FO80,340^BCN,90,Y,N,N^FD" + (correios.rastreio || "").replace(/\s/g, "") + "^FS\n";
  
  // Recebedor/Assinatura
  zpl += "^FO40,470^A0N,20,20^FDRecebedor:________________________________________________^FS\n";
  zpl += "^FO40,500^A0N,20,20^FDAssinatura:_______________________ Documento:_____________^FS\n";
  
  // Bloco DESTINATARIO
  const destNome2 = clean(correios.destinatario.nome);
  const fontSize2 = destNome2.length > 39 ? 26 : 38;
  zpl += "^FO20,540^GB772,30,30^FS^FO30,545^A0N,22,22^FR^FDDESTINATARIO^FS\n";
  zpl += `^FO40,580^A0N,${fontSize2},${fontSize2}^FB700,2,L,0^FD${destNome2}^FS\n`;
  zpl += "^FO40,635^A0N,25,25^FD" + clean(correios.destinatario.end1) + "^FS\n";
  zpl += "^FO40,665^A0N,25,25^FD" + clean(correios.destinatario.end2) + "^FS\n";
  zpl += "^FO40,695^A0N,36,36^FD" + clean(correios.destinatario.cep) + " " + clean(correios.destinatario.cidade) + "^FS\n";
  
  // Barcode CEP
  zpl += "^BY2,3,70^FO150,745^BCN,70,Y,N,N^FD" + (correios.destinatario.cep || "").replace(/\D/g, "") + "^FS\n";
  
  // Bloco REMETENTE
  zpl += "^FO20,845^GB772,30,30^FS^FO30,850^A0N,22,22^FR^FDREMETENTE^FS\n";
  zpl += "^FO40,885^A0N,20,20^FD" + clean(correios.remetente.nome) + "^FS\n";
  zpl += "^FO40,910^A0N,20,20^FD" + clean(correios.remetente.endereco) + "^FS\n";
  zpl += "^FO40,935^A0N,20,20^FD" + clean(correios.remetente.cidade) + " - " + clean(correios.remetente.uf) + " CEP: " + clean(correios.remetente.cep) + "^FS\n";
  
  zpl += "^XZ";
  
  // SALVAR ZPL COMPLETO PARA INSPEÇÃO
  try {
    const fileName = `label_${identificador}.zpl`;
    fs.writeFileSync(path.join(process.cwd(), fileName), zpl);
    fs.writeFileSync(path.join(process.cwd(), "last_label.zpl"), zpl);
    console.log(`[ZPL_SALVO] arquivo=${fileName}`);
  } catch (e) {
    console.error("Erro ao salvar arquivo ZPL:", e);
  }

  return zpl;
}

// Função para apenas mesclar os PDFs sem nenhum tratamento (bruto)
async function mergePdfsRaw(danfeBuffer: Buffer | null, labelBuffer: Buffer | null): Promise<Buffer> {
  console.log("Mesclando PDFs brutos (sem tratamento)...");
  const mergedDoc = await PDFDocument.create();
  
  if (danfeBuffer && danfeBuffer.length > 0) {
    const danfeDoc = await PDFDocument.load(danfeBuffer);
    const pages = await mergedDoc.copyPages(danfeDoc, danfeDoc.getPageIndices());
    pages.forEach(p => mergedDoc.addPage(p));
  }
  
  if (labelBuffer && labelBuffer.length > 0) {
    const labelDoc = await PDFDocument.load(labelBuffer);
    const pages = await mergedDoc.copyPages(labelDoc, labelDoc.getPageIndices());
    pages.forEach(p => mergedDoc.addPage(p));
  }
  
  const pdfBytes = await mergedDoc.save();
  return Buffer.from(pdfBytes);
}

// Endpoint para baixar e consolidar DANFEs
app.post("/api/download-danfes", async (req, res) => {
  const { nfes } = req.body; // Array de nIdNF

  if (!nfes || !Array.isArray(nfes) || nfes.length === 0) {
    return res.status(400).json({ error: "Nenhuma NF-e fornecida." });
  }

  try {
    const mergedDoc = await PDFDocument.create();
    let sucesso = 0;

    for (const nIdNF of nfes) {
      try {
        const respostaDanfe = await chamarOmie("produtos/dfedocs", "ObterEtiquetaDanfe", { nIdNfe: nIdNF });
        const urlPdf = respostaDanfe.cPdf;
        if (!urlPdf) continue;

        const pdfResponse = await axios.get(urlPdf, { responseType: "arraybuffer" });
        const danfeDoc = await PDFDocument.load(pdfResponse.data);
        const pages = await mergedDoc.copyPages(danfeDoc, danfeDoc.getPageIndices());
        pages.forEach(p => mergedDoc.addPage(p));
        sucesso++;
      } catch (e) {
        console.error(`Erro ao obter DANFE ${nIdNF}:`, e);
      }
    }

    if (sucesso === 0) {
      return res.status(404).json({ error: "Nenhuma DANFE pôde ser obtida." });
    }

    const processedPdfBytes = await mergedDoc.save();
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="danfes_consolidadas.pdf"');
    res.send(Buffer.from(processedPdfBytes));
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/generate-zpl", async (req, res) => {
  const { nfe, enderecoStr, frete, rastreio } = req.body;

  try {
    const endereco = parseEndereco(enderecoStr);
    
    // REGRA OFICIAL DO NEGÓCIO: Baseado no Serial Number ou flag de Artigo Perigoso
    const serial_number = String(nfe.serial || "").trim();
    const isSpecial = !!serial_number || !!nfe.artigo_perigoso;

    // Preparar dados para o gerador de ZPL
    const zplData = {
      omie: {
        nf_numero: nfe.ide.nNF,
        nf_serie: nfe.ide.serie,
        nf_data: nfe.ide.dEmi,
        nf_valor: nfe.total.ICMSTot.vNF.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
        nf_chave: nfe.compl.cChaveNFe,
        nf_protocolo: nfe.compl.nIdNF + " - " + nfe.ide.dEmi, // Protocolo real viria da Omie, mas usamos o ID como fallback
        emitente: {
          nome: REMETENTE.nome,
          cnpj: REMETENTE.cpfCnpj,
          ie: "0736226-99", // Fallback
          fone: "(81) 99317-2506", // Fallback
          endereco: REMETENTE.logradouro + ", " + REMETENTE.numero,
          cidade: REMETENTE.cep + " " + REMETENTE.cidade + " - " + REMETENTE.uf
        },
        destinatario: {
          nome: nfe.nfDestInt.cRazao,
          doc: nfe.nfDestInt.cnpj_cpf,
          endereco: endereco.logradouro + ", " + endereco.numero,
          cidade: endereco.cep + " " + endereco.cidade + " - " + endereco.uf
        },
        serial_number: serial_number
      },
      correios: {
        contrato: CORREIOS_CARTAO_POSTAGEM,
        servico: frete?.toUpperCase().includes("SEDEX") ? "SEDEX CONTRATO AG" : "PAC CONTRATO AG",
        rastreio: rastreio || nfe.rastreio || "Aguardando...",
        nf: nfe.ide.nNF,
        artigo_perigoso: isSpecial,
        destinatario: {
          nome: nfe.nfDestInt.cRazao,
          end1: endereco.logradouro + ", " + endereco.numero,
          end2: endereco.complemento || endereco.bairro || "",
          cep: endereco.cep.replace(/\D/g, ""),
          cidade: endereco.cidade + "/" + endereco.uf
        },
        remetente: {
          nome: REMETENTE.nome,
          endereco: REMETENTE.logradouro + ", " + REMETENTE.numero,
          cidade: REMETENTE.cidade,
          cep: REMETENTE.cep.replace(/\D/g, ""),
          uf: REMETENTE.uf
        }
      }
    };

    const zpl = await generateZplString(zplData);
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="etiqueta_${nfe.ide.nNF}.zpl"`);
    res.send(zpl);
  } catch (error: any) {
    console.error("Erro ao gerar ZPL:", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/download-combined/:nIdNF/:idPre", async (req, res) => {
  const { nIdNF, idPre } = req.params;
  const { serial } = req.query;

  try {
    let danfeBuffer: Buffer | null = null;
    let labelBuffer: Buffer | null = null;

    // 1. Obter e baixar DANFE
    try {
      const respostaDanfe = await chamarOmie("produtos/dfedocs", "ObterEtiquetaDanfe", { nIdNfe: Number(nIdNF) });
      const urlDanfe = respostaDanfe.cPdf;
      if (urlDanfe) {
        const danfeResponse = await axios.get(urlDanfe, { responseType: "arraybuffer" });
        danfeBuffer = Buffer.from(danfeResponse.data);
      }
    } catch (e) {
      console.error(`Erro ao baixar DANFE para combined PDF:`, e);
    }

    // 2. Obter e baixar Etiqueta
    try {
      const rotuloResponse = await axios.post(`${BASE_URL_CORREIOS}/prepostagem/v1/prepostagens/rotulo/assincrono/pdf`, {
        idsPrePostagem: [idPre],
        tipoRotulo: "P",
        formatoRotulo: "ET",
      }, {
        headers: getCorreiosHeaders(),
      });

      const idRecibo = rotuloResponse.data.idRecibo || rotuloResponse.data.recibo || rotuloResponse.data.idSolicitacao || rotuloResponse.data.idReciboRotulo;
      
      const findPdfInPayload = (payload: any) => {
        const keys = ["dados", "data", "arquivo", "arquivoBase64", "pdf", "pdfBase64", "conteudo", "conteudoBase64", "rotulo", "rotuloBase64"];
        for (const key of keys) {
          if (payload[key]) return payload[key];
        }
        return null;
      };

      const pdfBase64 = findPdfInPayload(rotuloResponse.data);
      if (pdfBase64) {
        labelBuffer = Buffer.from(pdfBase64.replace(/^data:application\/pdf;base64,/, ""), "base64");
      } else if (idRecibo) {
        const urlsDownload = [
          (id: string) => `${BASE_URL_CORREIOS}/prepostagem/v1/prepostagens/rotulo/download/assincrono/${id}`,
          (id: string) => `${BASE_URL_CORREIOS}/prepostagem/v1/prepostagens/rotulo/assincrono/pdf/${id}`,
          (id: string) => `${BASE_URL_CORREIOS}/prepostagem/v1/prepostagens/rotulo/download/${id}`,
        ];

        for (let i = 0; i < 8; i++) {
          await new Promise(resolve => setTimeout(resolve, 1500));
          for (const urlFn of urlsDownload) {
            try {
              const downloadResponse = await axios.get(urlFn(idRecibo), {
                headers: getCorreiosHeaders(),
                responseType: "arraybuffer",
              });
              if (downloadResponse.status === 200) {
                const contentType = String(downloadResponse.headers["content-type"] || "");
                if (contentType.includes("application/pdf")) {
                  labelBuffer = Buffer.from(downloadResponse.data);
                  break;
                } else {
                  const json = JSON.parse(Buffer.from(downloadResponse.data).toString());
                  const b64 = findPdfInPayload(json);
                  if (b64) {
                    labelBuffer = Buffer.from(b64.replace(/^data:application\/pdf;base64,/, ""), "base64");
                    break;
                  }
                }
              }
            } catch (e: any) {
              console.warn(`Tentativa de download falhou para URL: ${e.message || e}`);
            }
          }
          if (labelBuffer) break;
        }
      }
    } catch (e) {
      console.error(`Erro ao baixar Etiqueta para combined PDF:`, e);
    }

    if (!danfeBuffer && !labelBuffer) {
      return res.status(404).json({ error: "Não foi possível obter a DANFE nem a Etiqueta." });
    }

    // Mesclar PDFs brutos
    const processedPdfBytes = await mergePdfsRaw(danfeBuffer, labelBuffer);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="documentos_${idPre}.pdf"`);
    res.send(processedPdfBytes);

  } catch (error: any) {
    console.error("Erro ao gerar PDF combinado:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

app.get("/api/diagnostic-zpl", (req, res) => {
  const airplaneHex = "0000000000000018000000003C000000007E00000000FF00000001FF80000003FFC0000007FFE000000FFFF000001FFFF800003FFFFC000007FFFFE00000FFFFFF00001FFFFFF80003FFFFFFC0007FFFFFFE000FFFFFFFFF01FFFFFFFF83FFFFFFFFC7FFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFF7FFFFFFFFE3FFFFFFFFC1FFFFFFFF80FFFFFFFFF007FFFFFFE003FFFFFFC001FFFFFF8000FFFFFF00007FFFFE00003FFFFC00001FFFF800000FFFF0000007FFE0000003FFC0000001FF80000000FF000000007E000000003C000000001800000000000000";
  
  let zpl = "^XA^CI28^MMT,Y^MNW^MTD^MD15^PR4,4\n";
  zpl += "^FO20,20^GB772,1178,3^FS\n"; // Borda
  zpl += "^FO100,100^A0N,40,40^FDTESTE SIMBOLO AVIAO^FS\n";
  
  // Símbolo GFA (40x40 -> 5 bytes por linha, 40 linhas = 200 bytes)
  zpl += "^FO300,300^GFA,200,200,5," + airplaneHex + "^FS\n";
  
  zpl += "^FO100,500^A0N,30,30^FDPROIBIDO EM AERONAVE^FS\n";
  zpl += "^XZ";

  try {
    fs.writeFileSync(path.join(process.cwd(), "test_airplane.zpl"), zpl);
    console.log("[DIAGNOSTICO] test_airplane.zpl gerado.");
  } catch (e) {
    console.error("Erro ao salvar ZPL de diagnóstico:", e);
  }

  res.setHeader("Content-Type", "text/plain");
  res.send(zpl);
});

app.get("/api/debug-pedido/:pedido", async (req, res) => {
  const numeroPedidoNormalizado = req.params.pedido.trim().toUpperCase();
  
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

    // 2. Etapa Omie (Utilizando o cache para simular a busca atual do app)
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(fim.getDate() - 90);
    const data_inicio = inicio.toLocaleDateString("pt-BR");
    const data_fim = fim.toLocaleDateString("pt-BR");
    debug.etapaOmie.periodoInternoUsado = { dataInicio: data_inicio, dataFim: data_fim };

    try {
      const param = {
        pagina: 1, registros_por_pagina: 50,
        dEmiInicial: data_inicio, dEmiFinal: data_fim,
        tpNF: "1", tpAmb: "1", filtrar_por_status: "N",
        cDetalhesPedido: "S", cApenasResumo: "N"
      };
      debug.etapaOmie.criteriosUsados = param;
      
      const cache = await getCachedNFs();
      debug.etapaOmie.respostaBrutaResumo.produtos = { total_de_registros: cache.produtos.length };
      
      const foundProduto = cache.produtos.find((nf: any) => {
         const ped = String(nf.pedido?.cNumPedido || "").trim().toUpperCase();
         return ped === numeroPedidoNormalizado || (ped.length > 2 && numeroPedidoNormalizado.includes(ped)) || (numeroPedidoNormalizado.length > 2 && ped.includes(numeroPedidoNormalizado));
      });
      
      if (foundProduto) {
         debug.etapaOmie.encontrouNF = true;
         debug.etapaOmie.numeroNFEncontrada = foundProduto.ide?.nNF;
         debug.etapaOmie.campoOndePedidoFoiEncontrado = "pedido.cNumPedido (Busca Ampla Produtos)";
         debug.etapaOmie.dadosNfEncontrada = { ide: foundProduto.ide, pedido: foundProduto.pedido };
      }
    } catch (e: any) {
       debug.etapaOmie.retornouErro = true;
       debug.etapaOmie.erroOmie = e.message;
    }

    if (!debug.etapaOmie.encontrouNF) {
       try {
         const paramServ = {
           pagina: 1, registros_por_pagina: 50,
           dEmiInicial: data_inicio, dEmiFinal: data_fim
         };
         debug.etapaOmie.criteriosUsados.servicos = paramServ;
         const cache = await getCachedNFs();
         
         const foundServico = cache.servicos.find((nf: any) => {
            const ped = String(nf.pedido?.cNumPedido || "").trim().toUpperCase();
            return ped === numeroPedidoNormalizado || (ped.length > 2 && numeroPedidoNormalizado.includes(ped)) || (numeroPedidoNormalizado.length > 2 && ped.includes(numeroPedidoNormalizado));
         });
         
         if (foundServico) {
            debug.etapaOmie.encontrouNF = true;
            debug.etapaOmie.numeroNFEncontrada = foundServico.ide?.nNF || foundServico.nNumeroNFSe;
            debug.etapaOmie.campoOndePedidoFoiEncontrado = "cNumeroOS (Busca Ampla Serviços)";
            debug.etapaOmie.dadosNfEncontrada = foundServico;
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

    res.json(debug);
  } catch (err: any) {
    debug.mensagemFinal = `Erro geral: ${err.message}`;
    res.status(500).json(debug);
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error("Erro ao iniciar o servidor:", err);
    process.exit(1);
  });
}

export default app;

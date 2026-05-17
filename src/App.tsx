import * as React from "react";
import { useState, useEffect } from "react";
import { Search, Download, FileText, FileCode, Calendar, Loader2, AlertCircle, CheckCircle2, Printer, Package, LogOut, User, Settings, Activity, ArrowRight, Pencil, Lock, RotateCw, Truck, Boxes, MapPin, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { onAuthStateChanged, signOut, EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { auth } from "./firebase";
import NotificationBanner from "./components/NotificationBanner";
import Login from "./components/Login";

interface NFe {
  ide: {
    nNF: string;
    serie: string;
    dEmi: string;
  };
  compl: {
    cChaveNFe: string;
    nIdNF: number;
  };
  nfDestInt: {
    cRazao: string;
    cnpj_cpf: string;
  };
  total: {
    ICMSTot: {
      vNF: number;
    };
  };
  pedido: {
    cNumPedido: string;
  };
  det: {
    prod: {
      xProd: string;
      qCom: number;
      uCom: string;
    };
  }[] | null;
  // Novos campos
  endereco?: string;
  frete?: string;
  permiteSerial?: boolean;
  observacoes?: string;
  serial?: string;
  labelStatus?: 'success' | 'error' | 'loading' | null;
  rastreio?: string;
  idPre?: string;
  serialSaved?: boolean;
  isEditingSerial?: boolean;
  labelError?: string;
  printed?: boolean;
  modulo?: 'vendas' | 'servicos';
  separado?: boolean;
  marcadoSeparado?: boolean;
  statusSeparacao?: string;
  separandoLoading?: boolean;
  statusDropdownOpen?: boolean;
  // Campos da Planilha (Pedidos em Separação)
  origem?: string;
  priority?: "Atrasado" | "Alta prioridade" | "Média prioridade" | "Baixa prioridade";
  priorityScore?: number;
  deadline?: string;
  daysLeft?: number;
  dataPedido?: string;
  isSpreadsheet?: boolean;
  status?: string;
  debugEtapas?: {
    pedido: string;
    omie: { consultado: boolean; encontrado: boolean; nf: string | null; erro: string | null };
    planilha: { consultado: boolean; encontrado: boolean; abasVerificadas: string[]; abaEncontrada: string | null; erro: string | null; detalhes: string[] };
    etiqueta: { tentouGerar: boolean; sucesso: boolean; erro: string | null };
  };
}

interface PasswordChangeFormProps {
  onSuccess: () => void;
  isForceChange?: boolean;
}

function PasswordChangeForm({ onSuccess, isForceChange }: PasswordChangeFormProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      setLoading(false);
      return;
    }

    if (newPassword.toLowerCase() === "exobots") {
      setError("A nova senha não pode ser 'Exobots'.");
      setLoading(false);
      return;
    }

    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error("Usuário não autenticado.");

      // Reautenticar
      const credential = EmailAuthProvider.credential(user.email, isForceChange ? "Exobots" : currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Atualizar senha
      await updatePassword(user, newPassword);
      
      setSuccess("Senha alterada com sucesso!");
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err: any) {
      console.error("Erro ao alterar senha:", err);
      if (err.code === "auth/wrong-password") {
        setError("Senha atual incorreta.");
      } else if (err.code === "auth/weak-password") {
        setError("A nova senha é muito fraca.");
      } else {
        setError("Erro ao alterar senha. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl flex items-center gap-2 text-xs font-medium">
          <AlertCircle size={16} />
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-xl flex items-center gap-2 text-xs font-medium">
          <CheckCircle2 size={16} />
          {success}
        </div>
      )}

      {!isForceChange && (
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Senha Atual</label>
          <input 
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm outline-none focus:border-brand-teal transition-all"
          />
        </div>
      )}

      <div className="space-y-1">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Nova Senha</label>
        <input 
          type="password"
          required
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm outline-none focus:border-brand-teal transition-all"
        />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Confirmar Nova Senha</label>
        <input 
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-4 text-sm outline-none focus:border-brand-teal transition-all"
        />
      </div>

      <button 
        type="submit"
        disabled={loading}
        className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] mt-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Salvar Nova Senha"}
      </button>
    </form>
  );
}

interface ApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
}

class EditErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Edit flow crashed:", error, errorInfo);
  }

  render() {
    const _this = this as any;
    if (_this.state.hasError) {
      return (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm font-medium">
          Ocorreu um erro no fluxo. Por favor, tente novamente. <br/>
          <span className="text-[10px] font-mono opacity-70">{_this.state.error?.message}</span>
        </div>
      );
    }

    return _this.props.children;
  }
}

function ApprovalModal({ isOpen, onClose, onConfirm, title, description }: ApprovalModalProps) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const user = auth.currentUser;
      if (!user || !user.email) throw new Error("Usuário não autenticado.");

      const credential = EmailAuthProvider.credential(user.email, password);
      await reauthenticateWithCredential(user, credential);

      onConfirm();
      onClose();
    } catch (err: any) {
      console.error("Erro na aprovação:", err);
      setError("Senha incorreta. Ação não autorizada.");
    } finally {
      setLoading(false);
      setPassword("");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-8"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-brand-teal/10 rounded-xl flex items-center justify-center text-brand-teal">
            <Lock size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">{title}</h3>
            <p className="text-xs text-slate-500">{description}</p>
          </div>
        </div>

        <form onSubmit={handleConfirm} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-xl flex items-center gap-2 text-xs font-medium">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Confirme sua Senha</label>
            <input 
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-sm outline-none focus:border-brand-teal transition-all"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-100 text-slate-600 py-3 rounded-xl font-bold transition-all active:scale-[0.98]"
            >
              Cancelar
            </button>
            <button 
              type="submit"
              disabled={loading}
              className="flex-1 bg-brand-teal text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<{ email: string; name: string; isAdmin?: boolean } | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [dataInicio, setDataInicio] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('pt-BR'));
  const [dataFim, setDataFim] = useState(new Date().toLocaleDateString('pt-BR'));
  const [nfes, setNfes] = useState<NFe[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [generatingLabels, setGeneratingLabels] = useState(false);
  const [savingSerials, setSavingSerials] = useState(false);
  const [loadingExpedir, setLoadingExpedir] = useState(false);
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [bannerLastInvoicedDate, setBannerLastInvoicedDate] = useState<string | null>(null);
  const [bannerInvoicedToday, setBannerInvoicedToday] = useState<{ invoice_number: string; recipient_name: string; modulo?: 'vendas' | 'servicos' }[]>([]);
  const [showProfile, setShowProfile] = useState(false);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [activeTab, setActiveTab] = useState<'expedicao' | 'entregas'>('expedicao');
  const [approvalModal, setApprovalModal] = useState<{ isOpen: boolean; onConfirm: () => void; title: string; description: string } | null>(null);

  const operatorName = user?.name || "";

  const formatUserName = (name: string) => {
    if (!name) return "Usuário";
    return name
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        const rawName = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || "Usuário";
        setUser({
          email: firebaseUser.email || "",
          name: formatUserName(rawName),
          isAdmin: firebaseUser.email === "ronald.oliveira@neurobots.com.br" || firebaseUser.email === "ronaldoliveiraneurobots@gmail.com"
        });
      } else {
        setUser(null);
      }
      setIsAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchBannerData();
      fetchPedidosExpedir(true);
    }
  }, [user]);

  const fetchPedidosExpedir = async (isInitial = false) => {
    setLoadingExpedir(true);
    if (!isInitial) setError(null);
    try {
      const response = await fetch("/api/pedidos-expedir");
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      const spreadsheetOrders: NFe[] = data.orders || [];
      setNfes(prev => {
        // Remover pedidos anteriores da planilha para não duplicar na atualização
        const currentOmie = prev.filter(n => !n.isSpreadsheet);
        return [...spreadsheetOrders, ...currentOmie];
      });

      // Iniciar geração automática para itens com NF emitida, sem rastreio:
      // - Descartáveis (permiteSerial: false): sempre auto-gera
      // - Myobots/Exobots (permiteSerial: true): auto-gera apenas se serial já foi salvo
      const autoGenerateOrders = spreadsheetOrders.filter(nfe => 
        !nfe.rastreio && 
        nfe.modulo !== 'servicos' && 
        nfe.status === "NF Emitida" &&
        (!nfe.permiteSerial || nfe.serialSaved)
      );
      
      if (autoGenerateOrders.length > 0) {
        autoGenerateOrders.forEach(nfe => {
          handleGenerateLabel(nfe);
        });
      }

      if (!isInitial) {
        setSuccess("Pedidos em separação atualizados com sucesso!");
      }
    } catch (err: any) {
      console.error("Erro ao buscar pedidos da planilha:", err);
      if (!isInitial) {
        setError(err.message || "Erro ao buscar pedidos da planilha.");
      }
    } finally {
      setLoadingExpedir(false);
    }
  };

  const fetchBannerData = async () => {
    try {
      const hoje = new Date();
      const trintaDiasAtras = new Date();
      trintaDiasAtras.setDate(hoje.getDate() - 30);

      // Buscar NF-es para o banner
      const response = await fetch("/api/nfes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          data_inicio: trintaDiasAtras.toLocaleDateString('pt-BR'), 
          data_fim: hoje.toLocaleDateString('pt-BR') 
        }),
      });
      const data = await response.json();
      if (data.nfes && data.nfes.length > 0) {
        const sorted = [...data.nfes].sort((a, b) => {
          const dateA = parseDate(a.ide?.dEmi)?.getTime() || 0;
          const dateB = parseDate(b.ide?.dEmi)?.getTime() || 0;
          return dateB - dateA;
        });
        
        setBannerLastInvoicedDate(sorted[0].ide.dEmi);

        const todayItems = data.nfes.filter((nfe: any) => {
          const nfeDate = parseDate(nfe.ide?.dEmi);
          return nfeDate && 
                 nfeDate.getDate() === hoje.getDate() && 
                 nfeDate.getMonth() === hoje.getMonth() && 
                 nfeDate.getFullYear() === hoje.getFullYear();
        }).map((nfe: any) => ({
          invoice_number: String(nfe.ide?.nNF || "s/n"),
          recipient_name: nfe.nfDestInt.cRazao,
          modulo: nfe.modulo
        }));
        
        setBannerInvoicedToday(todayItems);
      }
    } catch (e) {
      console.error("Erro ao buscar dados do banner:", e);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const handleSearch = async (isInitial = false) => {
    setLoading(true);
    if (!isInitial) setError(null);
    setSuccess(null);
    try {
      const response = await fetch("/api/nfes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_inicio: dataInicio, data_fim: dataFim }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      const fetchedNfes: NFe[] = data.nfes || [];
      
      if (fetchedNfes.length > 0) {
        // Buscar dados das planilhas
        const pedidos = fetchedNfes.map(nfe => nfe.pedido?.cNumPedido).filter(Boolean);
        const sheetsResponse = await fetch("/api/sheets-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pedidos }),
        });
        const sheetsData = await sheetsResponse.json();
        
        if (sheetsData.warning) {
          setError(sheetsData.warning);
        }

        if (sheetsData.data) {
          fetchedNfes.forEach(nfe => {
            const pedido = String(nfe.pedido?.cNumPedido || "").trim().toUpperCase();
            const sheetInfo = sheetsData.data[pedido];
            
            if (sheetInfo) {
              nfe.endereco = sheetInfo.endereco;
              nfe.frete = sheetInfo.frete;
              nfe.permiteSerial = sheetInfo.permiteSerial;
              nfe.observacoes = sheetInfo.observacoes;
            }

            // Também verificar se os itens contêm os termos solicitados
            const temTermoSerial = nfe.det?.some(item => {
              const desc = item.prod.xProd.toUpperCase();
              return desc.includes("ELETROMIOGRÁFO - MYOBOTS") || desc.includes("EXOBOTS");
            });

            if (temTermoSerial) {
              nfe.permiteSerial = true;
            }
          });
        }
      }

      if (fetchedNfes.length > 0) {
        setNfes(prev => {
          const spreadsheetOrders = prev.filter(n => n.isSpreadsheet);
          return [...spreadsheetOrders, ...fetchedNfes];
        });
        
        // Iniciar geração automática para itens que NÃO permitem serial e NÃO têm rastreio (apenas para Vendas)
        const pendingNfes = fetchedNfes.filter(nfe => !nfe.permiteSerial && !nfe.rastreio && nfe.modulo !== 'servicos');
        if (pendingNfes.length > 0) {
          pendingNfes.forEach(nfe => {
            handleGenerateLabel(nfe);
          });
        }
      } else {
        if (!isInitial) {
          setError("Nenhuma NF-e encontrada para o período informado.");
        }
      }
    } catch (err: any) {
      if (!isInitial) {
        setError(err.message || "Erro ao buscar NF-es.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSerialChange = (nIdNF: number, value: string) => {
    setNfes(prev => prev.map(nfe => nfe.compl.nIdNF === nIdNF ? { ...nfe, serial: value } : nfe));
  };

  const handleEditSerial = (nIdNF: number) => {
    setNfes(prev => prev.map(nfe => nfe.compl.nIdNF === nIdNF ? { ...nfe, isEditingSerial: true } : nfe));
  };

  const handleGenerateLabel = async (nfe: NFe, forceNewTracking = false) => {
    // Se for serviço, não gera etiqueta
    if (nfe.modulo === 'servicos') return;

    // Se já tem rastreio e não estamos forçando um novo, não gera
    if (nfe.rastreio && !forceNewTracking) return;

    // Se for item de serial, precisa ter o serial preenchido
    if (nfe.permiteSerial && !nfe.serial) return;
    if (!nfe.endereco) {
      setNfes(prev => prev.map(n => n.compl.nIdNF === nfe.compl.nIdNF ? { ...n, labelStatus: 'error', labelError: 'Endereço não encontrado' } : n));
      return;
    }

    setNfes(prev => prev.map(n => n.compl.nIdNF === nfe.compl.nIdNF ? { ...n, labelStatus: 'loading' } : n));

    try {
      const response = await fetch("/api/generate-label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          nfe, 
          enderecoStr: nfe.endereco,
          frete: nfe.frete || "PAC"
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao gerar etiqueta.");

      // Salvar na planilha (Pedido, Serial, Rastreio, Operador)
      await fetch("/api/save-serials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          operatorName,
          serials: [{ 
            pedido: nfe.pedido.cNumPedido, 
            serial: nfe.serial || "", 
            rastreio: data.rastreio,
            itens: nfe.det ? nfe.det.map(d => `${d.prod.qCom} ${d.prod.xProd}`).join(", ") : ""
          }] 
        }),
      });

      setNfes(prev => prev.map(n => n.compl.nIdNF === nfe.compl.nIdNF ? { 
        ...n, 
        labelStatus: 'success', 
        rastreio: data.rastreio,
        idPre: data.idPre,
        serialSaved: true,
        isEditingSerial: false
      } : n));
    } catch (err: any) {
      console.error("Erro ao gerar etiqueta:", err);
      setNfes(prev => prev.map(n => n.compl.nIdNF === nfe.compl.nIdNF ? { ...n, labelStatus: 'error', labelError: err.message } : n));
    }
  };

  const executeSaveAndGenerate = async (nfe: NFe) => {
    if (!nfe.serial?.trim()) {
      setError(`Digite o número de série para o pedido ${nfe.pedido?.cNumPedido || nfe.ide?.nNF || ""} antes de salvar.`);
      return;
    }

    setError(null);

    // Se já tem rastreio, apenas salva o serial na planilha
    if (nfe.rastreio) {
      setNfes(prev => prev.map(n => n.compl.nIdNF === nfe.compl.nIdNF ? { ...n, labelStatus: 'loading' } : n));
      try {
        await fetch("/api/save-serials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            operatorName,
            serials: [{ 
              pedido: nfe.pedido?.cNumPedido || "", 
              serial: nfe.serial || "", 
              rastreio: nfe.rastreio,
              itens: nfe.det ? nfe.det.map(d => `${d.prod.qCom} ${d.prod.xProd}`).join(", ") : ""
            }] 
          }),
        });
        
        setNfes(prev => prev.map(n => n.compl.nIdNF === nfe.compl.nIdNF ? { 
          ...n, 
          labelStatus: 'success', 
          serialSaved: true,
          isEditingSerial: false
        } : n));
        setSuccess(`Serial do pedido ${nfe.pedido?.cNumPedido || nfe.ide?.nNF || ""} atualizado com sucesso.`);
      } catch (err: any) {
        console.error("Erro ao atualizar serial:", err);
        setNfes(prev => prev.map(n => n.compl.nIdNF === nfe.compl.nIdNF ? { ...n, labelStatus: 'error', labelError: err.message } : n));
      }
      return;
    }

    await handleGenerateLabel(nfe);
  };

  const handleSaveAndGenerate = async (nfe: NFe) => {
    // Se já foi salvo antes (está editando), pede senha
    if (nfe.serialSaved) {
      setApprovalModal({
        isOpen: true,
        title: "Confirmar Alteração",
        description: `Confirme sua senha para alterar o serial do pedido ${nfe.pedido?.cNumPedido || nfe.ide?.nNF || ""}.`,
        onConfirm: () => executeSaveAndGenerate(nfe)
      });
    } else {
      // Se é a primeira vez, salva direto sem pedir senha
      await executeSaveAndGenerate(nfe);
    }
  };

  const handleUpdateTracking = (nfe: NFe) => {
    handleGenerateLabel(nfe, true);
  };

  const handleMarcarSeparado = async (nfe: NFe, novoStatus: string = 'Enviado') => {
    if (!nfe.isSpreadsheet) return; // apenas pedidos da planilha
    const pedido = nfe.pedido?.cNumPedido;
    if (!pedido) return;

    // Fechar dropdown e mostrar loading
    setNfes(prev => prev.map(n => n.compl.nIdNF === nfe.compl.nIdNF
      ? { ...n, separandoLoading: true, statusDropdownOpen: false }
      : n
    ));
    try {
      const response = await fetch("/api/marcar-separado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido, operatorName, status: novoStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Erro ao salvar status.");

      const isMarcado = novoStatus !== 'Em separação';
      setNfes(prev => prev.map(n => n.compl.nIdNF === nfe.compl.nIdNF
        ? { ...n, marcadoSeparado: isMarcado, statusSeparacao: novoStatus, separandoLoading: false }
        : n
      ));
      setSuccess(`Status do pedido ${pedido} atualizado: ${novoStatus}`);
    } catch (err: any) {
      console.error("Erro ao salvar status:", err);
      setNfes(prev => prev.map(n => n.compl.nIdNF === nfe.compl.nIdNF ? { ...n, separandoLoading: false } : n));
      setError(err.message || "Erro ao salvar status.");
    }
  };

  const handlePrintCombined = async (nIdNF: number, idPre: string, serial?: string) => {
    try {
      const nfe = nfes.find(n => n.compl.nIdNF === nIdNF);
      
      // Marcar como impresso para mudar a cor da linha
      setNfes(prev => prev.map(n => n.compl.nIdNF === nIdNF ? { ...n, printed: true } : n));

      // Salvar na planilha (Pedido, Serial, Rastreio, Operador) ao imprimir, como solicitado
      if (nfe) {
        await fetch("/api/save-serials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            operatorName,
            serials: [{ 
              pedido: nfe.pedido?.cNumPedido || "", 
              serial: serial || nfe.serial || "", 
              rastreio: nfe.rastreio || "",
              itens: nfe.det ? nfe.det.map(d => `${d.prod.qCom} ${d.prod.xProd}`).join(", ") : ""
            }] 
          }),
        });

        // Auto-marcar como Enviado para todos os pedidos da planilha
        if (nfe.isSpreadsheet && !nfe.marcadoSeparado) {
          handleMarcarSeparado(nfe, 'Enviado');
        }
      }

      let url_combined = `/api/download-combined/${nIdNF}/${idPre}`;
      if (serial) {
        url_combined += `?serial=${encodeURIComponent(serial)}`;
      }

      const response = await fetch(url_combined);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao baixar documentos combinados.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `documentos_${idPre}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error("Erro ao imprimir:", err);
      setError(err.message || "Erro ao baixar DANFE + Etiqueta combinados.");
    }
  };

  const imprimirZPL = async (zplContent: string) => {
    console.log("Enviando para /print-zpl");
    const response = await fetch("http://127.0.0.1:8765/print-zpl", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        printer_name: "ELGIN L42PRO FULL",
        zpl: zplContent
      })
    });

    const data = await response.json();
    console.log("Resposta da impressão:", data);

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  };

  const handleDirectPrintZpl = async (nfe: NFe) => {
    setPrintingId(nfe.compl.nIdNF);
    setError(null);
    setSuccess(null);
    try {
      setSuccess("Enviando para impressora...");
      
      const response = await fetch("/api/generate-zpl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          nfe, 
          enderecoStr: nfe.endereco,
          frete: nfe.frete || "PAC",
          rastreio: nfe.rastreio
        }),
      });

      if (!response.ok) throw new Error("Erro ao gerar ZPL no servidor.");

      const zplGerado = await response.text();
      console.log("ZPL gerado:", zplGerado);
      
      await imprimirZPL(zplGerado);
      
      setSuccess("Etiqueta enviada para impressão com sucesso.");
      
      // Marcar como impresso localmente
      setNfes(prev => prev.map(n => n.compl.nIdNF === nfe.compl.nIdNF ? { ...n, printed: true } : n));

      // Auto-marcar como Enviado para todos os pedidos da planilha
      if (nfe.isSpreadsheet && !nfe.marcadoSeparado) {
        handleMarcarSeparado(nfe, 'Enviado');
      }
    } catch (err: any) {
      console.error("Erro ao imprimir:", err);
      setError("Erro ao imprimir: " + (err?.message || err));
    } finally {
      setPrintingId(null);
    }
  };

  const handleDownloadZpl = async (nfe: NFe) => {
    try {
      const response = await fetch("/api/generate-zpl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          nfe, 
          enderecoStr: nfe.endereco,
          frete: nfe.frete || "PAC",
          rastreio: nfe.rastreio
        }),
      });

      if (!response.ok) throw new Error("Erro ao gerar ZPL.");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `etiqueta_${nfe.ide.nNF}.zpl`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setSuccess(`ZPL baixado com sucesso para o pedido ${nfe.pedido?.cNumPedido || nfe.ide?.nNF || ""}`);
      
      // Marcar como impresso localmente
      setNfes(prev => prev.map(n => n.compl.nIdNF === nfe.compl.nIdNF ? { ...n, printed: true } : n));

      // Auto-marcar como Enviado para todos os pedidos da planilha ao baixar ZPL
      if (nfe.isSpreadsheet && !nfe.marcadoSeparado) {
        handleMarcarSeparado(nfe, 'Enviado');
      }
    } catch (err: any) {
      console.error("Erro ao gerar ZPL:", err);
      setError(err.message || "Erro ao gerar ZPL.");
    }
  };

  const handleSaveSerials = async () => {
      const serialsToSave = nfes
        .filter(nfe => nfe.permiteSerial && nfe.serial)
        .map(nfe => ({ 
          pedido: nfe.pedido?.cNumPedido || "", 
          serial: nfe.serial,
          rastreio: nfe.rastreio || "",
          itens: nfe.det ? nfe.det.map(d => `${d.prod.qCom} ${d.prod.xProd}`).join(", ") : ""
        }));

    if (serialsToSave.length === 0) {
      setError("Nenhum número de série preenchido para salvar.");
      return;
    }

    setSavingSerials(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/save-serials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          operatorName,
          serials: serialsToSave 
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao salvar seriais.");
      }

      setSuccess("Números de série salvos com sucesso na planilha!");

      // Após salvar, gerar etiquetas para os que têm serial
      const nfesWithSerial = nfes.filter(nfe => nfe.permiteSerial && nfe.serial && !nfe.rastreio);
      if (nfesWithSerial.length > 0) {
        setGeneratingLabels(true);
        for (const nfe of nfesWithSerial) {
          await handleGenerateLabel(nfe);
        }
        setGeneratingLabels(false);
      }
    } catch (err: any) {
      setError(err.message || "Erro ao salvar seriais.");
    } finally {
      setSavingSerials(false);
    }
  };

  const handleDownload = async () => {
    if (nfes.length === 0) return;

    setDownloading(true);
    setError(null);
    try {
      // Salvar seriais se houver
      const serialsToSave = nfes
        .filter(nfe => nfe.permiteSerial && nfe.serial)
        .map(nfe => ({ 
          pedido: nfe.pedido?.cNumPedido || "", 
          serial: nfe.serial,
          rastreio: nfe.rastreio || "",
          itens: nfe.det ? nfe.det.map(d => `${d.prod.qCom} ${d.prod.xProd}`).join(", ") : ""
        }));
      
      if (serialsToSave.length > 0) {
        await fetch("/api/save-serials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            operatorName,
            serials: serialsToSave 
          }),
        });
      }

      const nIds = nfes.map(nfe => nfe.compl.nIdNF);
      const response = await fetch("/api/download-danfes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nfes: nIds }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Erro ao gerar PDF.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `DANFEs_${dataInicio.replace(/\//g, '-')}_a_${dataFim.replace(/\//g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      setSuccess("PDF gerado e baixado com sucesso!");
    } catch (err: any) {
      setError(err.message || "Erro ao baixar DANFEs.");
    } finally {
      setDownloading(false);
    }
  };

  const totalValor = nfes.reduce((acc, nfe) => acc + (Number(nfe.total.ICMSTot.vNF) || 0), 0);
  const ticketMedio = nfes.length > 0 ? totalValor / nfes.length : 0;

  const parseDate = (dateStr: string) => {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    }
    return new Date(dateStr);
  };

  const invoicedToday = nfes.filter(nfe => {
    const nfeDate = parseDate(nfe.ide?.dEmi);
    const today = new Date();
    return nfeDate && 
           nfeDate.getDate() === today.getDate() && 
           nfeDate.getMonth() === today.getMonth() && 
           nfeDate.getFullYear() === today.getFullYear();
  }).map(nfe => ({
    invoice_number: String(nfe.ide?.nNF || "s/n"),
    recipient_name: nfe.nfDestInt.cRazao
  }));

  const lastInvoicedDate = nfes.length > 0 
    ? [...nfes].sort((a, b) => {
        const dateA = parseDate(a.ide?.dEmi)?.getTime() || 0;
        const dateB = parseDate(b.ide?.dEmi)?.getTime() || 0;
        return dateB - dateA;
      })[0].ide?.dEmi 
    : null;

  const checkForcePasswordChange = (password: string) => {
    if (password.toLowerCase() === "exobots") {
      setForcePasswordChange(true);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Erro ao sair:", e);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-brand-teal animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Login onLoginSuccess={checkForcePasswordChange} />;
  }

  if (forcePasswordChange) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-100 p-8"
        >
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Alteração Obrigatória</h2>
            <p className="text-slate-500 mt-2">Sua senha atual é temporária. Por favor, defina uma nova senha para continuar.</p>
          </div>

          <PasswordChangeForm 
            onSuccess={() => setForcePasswordChange(false)} 
            isForceChange={true}
          />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-72 bg-white border-r border-slate-200 flex-col fixed inset-y-0 z-50">
        <div className="p-8 border-b border-slate-100 flex items-center justify-center">
          <img src="/logo.png" alt="Neurobots" className="h-8 object-contain" />
        </div>

        <nav className="flex-1 p-6 space-y-2 mt-4">
          <button 
            onClick={() => setActiveTab('expedicao')}
            className={`w-full flex items-center gap-3 px-4 py-4 rounded-2xl transition-all duration-300 ${
              activeTab === 'expedicao' 
                ? 'bg-brand-teal text-white shadow-lg shadow-brand-teal/20' 
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Boxes size={20} className={activeTab === 'expedicao' ? 'text-white' : 'text-slate-400'} />
            <span className="text-sm font-black uppercase tracking-widest">Expedição</span>
          </button>
        </nav>

        <div className="p-6 border-t border-slate-100 mt-auto">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-500 shadow-sm">
                <User size={14} />
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase text-slate-400">Operador</span>
                <span className="text-xs font-bold text-slate-700 max-w-[150px] truncate" title={`Olá, ${user.name}`}>Olá, {user.name}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
              <button 
                onClick={() => setShowProfile(!showProfile)}
                className="flex-1 text-[11px] font-bold text-slate-500 hover:text-brand-teal transition-colors text-left"
              >
                Ver Perfil
              </button>
              <button 
                onClick={handleLogout}
                className="text-slate-400 hover:text-red-500 transition-colors p-1"
                title="Sair"
              >
                <LogOut size={14} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 lg:ml-72 flex flex-col min-h-screen">
        {/* Top Navigation Bar */}
        <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 px-4 md:px-8 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="lg:hidden w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-sm">
                <img src="/icone.png" alt="Icone" className="w-5 h-5 object-contain" />
              </div>
            </div>
            {/* O cabeçalho direito foi removido conforme solicitação */}
          </div>
        </nav>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        {activeTab === 'expedicao' ? (
          <>
            <AnimatePresence>
              {showProfile && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 overflow-hidden"
            >
              <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400">
                      <User size={24} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-slate-900">Perfil do Usuário</h2>
                      <p className="text-xs text-slate-500">{user.email}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowProfile(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    Fechar
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="space-y-6">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Informações</h3>
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Nome Completo</p>
                        <p className="text-sm font-bold text-slate-700">{user.name}</p>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Status da Conta</p>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                          <p className="text-sm font-bold text-slate-700">Ativa</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Alterar Senha</h3>
                    <PasswordChangeForm onSuccess={() => setShowProfile(false)} />
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Header Section */}
        <header className="mb-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-1">
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="inline-flex items-center gap-2 px-3 py-1 bg-brand-teal/10 text-brand-teal rounded-full text-[10px] font-black uppercase tracking-widest mb-2"
              >
                <Activity size={12} />
                Painel de Controle
              </motion.div>
              <h1 className="text-4xl md:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-brand-teal to-brand-purple leading-none pb-1">
                Sistema de Expedição
              </h1>
              <p className="text-slate-500 text-lg font-medium">Gerencie o fluxo de faturamento e etiquetas em tempo real.</p>
            </div>

            {/* Toolbar */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100"
            >
              <div className="flex items-center gap-2 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 group focus-within:border-brand-teal transition-all">
                <Calendar className="w-4 h-4 text-slate-400 group-focus-within:text-brand-teal" />
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    placeholder="Início"
                    className="bg-transparent border-none focus:ring-0 outline-none p-0 text-sm w-20 font-bold text-slate-700 placeholder:text-slate-300"
                    value={dataInicio}
                    onChange={(e) => setDataInicio(e.target.value)}
                  />
                  <span className="text-slate-300 font-bold">/</span>
                  <input 
                    type="text" 
                    placeholder="Fim"
                    className="bg-transparent border-none focus:ring-0 outline-none p-0 text-sm w-20 font-bold text-slate-700 placeholder:text-slate-300"
                    value={dataFim}
                    onChange={(e) => setDataFim(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={() => fetchPedidosExpedir(false)}
                  disabled={loading || loadingExpedir}
                  className="bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 text-slate-600 px-4 py-3 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 border border-slate-200"
                  title="Atualizar pedidos em separação da planilha"
                >
                  {loadingExpedir ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCw className="w-4 h-4" />}
                  <span className="hidden md:inline text-xs">Atualizar Separação</span>
                </button>
                <button 
                  onClick={handleSearch}
                  disabled={loading || loadingExpedir}
                  className="bg-brand-purple hover:bg-brand-purple/90 disabled:bg-slate-300 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-brand-purple/20 active:scale-95"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Buscar NF-es
                </button>
              </div>
            </motion.div>
          </div>
        </header>

        {/* Notifications */}
        <NotificationBanner 
          totalInPeriod={nfes.filter(n => !n.isSpreadsheet).length} 
          lastInvoicedDate={lastInvoicedDate || bannerLastInvoicedDate || undefined} 
          vendasCount={nfes.filter(nfe => nfe.modulo === 'vendas' && !nfe.isSpreadsheet).length}
          servicosCount={nfes.filter(nfe => nfe.modulo === 'servicos' && !nfe.isSpreadsheet).length}
          pedidosEmSeparacao={nfes.filter(nfe => nfe.isSpreadsheet).length}
          myobotsEmSeparacao={nfes.filter(nfe => nfe.isSpreadsheet && nfe.origem === 'Myobots - Vendas').length}
          exobotsEmSeparacao={nfes.filter(nfe => nfe.isSpreadsheet && nfe.origem === 'Exobots - Vendas').length}
          descartaveisEmSeparacao={nfes.filter(nfe => nfe.isSpreadsheet && nfe.origem === 'Descartáveis').length}
          pedidosAtrasados={nfes.filter(nfe => nfe.isSpreadsheet && nfe.priority === 'Atrasado').length}
        />

        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-3"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </motion.div>
          )}
          {success && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl flex items-center gap-3"
            >
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium">{success}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Stats & Actions */}
        {nfes.length > 0 && (
          <div className="mb-6">
            <div className="flex flex-col md:flex-row items-stretch gap-4">
              <div className="flex gap-4">
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 min-w-[140px] flex flex-col justify-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Ticket Médio</p>
                  <p className="text-2xl font-black text-slate-800">{formatCurrency(ticketMedio)}</p>
                </div>
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 min-w-[140px] flex flex-col justify-center">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Valor Acumulado</p>
                  <p className="text-2xl font-black text-brand-teal">{formatCurrency(totalValor)}</p>
                </div>
              </div>

              <div className="flex-1 bg-brand-blue-light/30 border border-brand-blue/20 p-4 rounded-2xl flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-brand-blue flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-slate-800">Dica para Seriais</p>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Quando for mais de um serial number, divida com vírgulas. 
                    Exemplo: <code className="bg-white/50 px-1 rounded font-mono border border-slate-200">0000M, 0001M</code>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main List */}
        <div className="bg-transparent">
          <div className="flex flex-col gap-4">
            {nfes.length === 0 && !loading && (
              <div className="bg-white rounded-xl p-12 text-center text-slate-400 italic shadow-sm border border-slate-100">
                Nenhum dado para exibir. Realize uma busca.
              </div>
            )}
            {loading && (
              <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-slate-100">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-brand-teal animate-spin" />
                  <p className="text-slate-500 font-medium">Buscando documentos na Omie...</p>
                </div>
              </div>
            )}
            {[...nfes]
              .sort((a, b) => {
                // 1. Prioridade da planilha (isSpreadsheet orders first)
                if (a.isSpreadsheet && !b.isSpreadsheet) return -1;
                if (!a.isSpreadsheet && b.isSpreadsheet) return 1;
                
                // 2. Score de prioridade dentro da planilha
                if (a.isSpreadsheet && b.isSpreadsheet) {
                  return (a.priorityScore || 4) - (b.priorityScore || 4);
                }

                // 3. Fallback para permitirSerial e outros
                return (b.permiteSerial ? 1 : 0) - (a.permiteSerial ? 1 : 0);
              })
              .map((nfe) => {
              const nameParts = (nfe.nfDestInt.cRazao || "").split(" ").filter(p => p.length > 0);
              const displayName = nameParts.length > 1 
                ? `${nameParts[0]} ${nameParts[nameParts.length - 1]}`
                : nameParts[0] || "N/A";

              const nfNumber = nfe.ide?.nNF ? `NF-${String(nfe.ide.nNF).padStart(6, '0')}` : "S/ NF";
              const orderNumber = nfe.pedido?.cNumPedido || "S/ Pedido";
              
              // Extrair cidade/UF do endereço para o badge
              const enderecoParts = nfe.endereco?.split(" - ") || [];
              const cidadeUf = enderecoParts.length > 0 ? enderecoParts[enderecoParts.length - 1] : "Brasil";

              return (
                <div 
                  key={nfe.compl.nIdNF} 
                  className={`rounded-xl p-5 border shadow-sm transition-all duration-300 flex flex-col lg:flex-row items-center gap-6 ${
                    (nfe.printed || nfe.marcadoSeparado)
                      ? 'bg-blue-50 border-blue-200' 
                      : 'bg-white border-slate-200 hover:shadow-md hover:border-brand-teal'
                  }`}
                >
                  {/* Left Column: Client */}
                  <div className="flex flex-col gap-1 lg:w-[30%]">
                    <span className="text-[10px] font-semibold tracking-[0.06em] uppercase text-[#8ea8aa] mb-0.5">Cliente</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-slate-800">{displayName}</span>
                      {nfe.frete && (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          nfe.frete.toUpperCase().includes('SEDEX') 
                            ? 'bg-amber-100 text-amber-800' 
                            : nfe.frete.toUpperCase().includes('PAC')
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {nfe.frete.toUpperCase().includes('PAC') ? <Package className="w-3 h-3 mr-1" /> : nfe.frete.toUpperCase().includes('SEDEX') ? <Truck className="w-3 h-3 mr-1" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                          {nfe.frete}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col mt-3">
                      <span className="text-[10px] font-semibold tracking-[0.06em] uppercase text-[#8ea8aa] mb-0.5">Pedido nº</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-800">{orderNumber}</span>
                        {nfe.modulo === 'servicos' ? (
                          <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">Serviço</span>
                        ) : !nfe.isSpreadsheet && (
                          <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Venda</span>
                        )}
                      </div>
                      <div className="flex flex-col mt-3">
                        <span className="text-[10px] font-semibold tracking-[0.06em] uppercase text-[#8ea8aa] mb-0.5">Nota fiscal</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[12px] font-bold text-slate-700">{nfNumber}</span>
                          {nfe.dataPedido && (
                            <span className="text-[11px] text-slate-400">
                              <span className="text-[#8ea8aa] mr-1">Pedido em</span>{nfe.dataPedido}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Middle Column: Items, Serial, Rastreio, Obs */}
                  <div className="flex flex-col gap-4 lg:w-[45%] border-t lg:border-t-0 lg:border-x border-slate-100 pt-4 lg:pt-0 lg:px-6 w-full">
                    {/* Items */}
                    <div className="flex flex-col gap-1 text-sm font-bold text-slate-800">
                      <span className="text-[10px] font-semibold tracking-[0.06em] uppercase text-[#8ea8aa] mb-0.5">Itens do pedido</span>
                      <div className="flex flex-wrap gap-1">
                        {nfe.det?.length ? nfe.det.map((item, i) => (
                          <span key={i}>
                            {item.prod.qCom}{item.prod.uCom} {item.prod.xProd}
                            {i < nfe.det!.length - 1 ? " • " : ""}
                          </span>
                        )) : (
                          <span className="text-slate-400 italic">Sem itens</span>
                        )}
                      </div>
                    </div>

                    {/* Serial & Rastreio (Stacked) */}
                    <div className="flex flex-col gap-3 text-xs text-slate-500 font-medium mt-1">
                      {/* Serial Input/Display */}
                      {nfe.modulo !== 'servicos' && nfe.permiteSerial && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] font-semibold tracking-[0.06em] uppercase text-[#8ea8aa] mb-0.5">Serial</span>
                          {nfe.serialSaved && !nfe.isEditingSerial ? (
                            <div className="flex items-center gap-2">
                              <span className="bg-white px-[14px] py-[8px] flex items-center min-w-[140px] min-h-[36px] rounded-xl border-[1.5px] border-brand-teal text-slate-700 font-bold font-mono text-[14px]">{nfe.serial}</span>
                              <button 
                                onClick={() => handleEditSerial(nfe.compl.nIdNF)}
                                className="p-1 text-brand-teal hover:text-brand-teal/80 transition-colors"
                              >
                                <Pencil size={14} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <input 
                                type="text"
                                placeholder="Serial..."
                                className="min-w-[140px] min-h-[36px] bg-white rounded-xl border-[1.5px] border-brand-teal px-[14px] py-[8px] text-[14px] font-mono focus:outline-none focus:ring-2 focus:ring-brand-teal/20 transition-all"
                                value={nfe.serial || ""}
                                onChange={(e) => handleSerialChange(nfe.compl.nIdNF, e.target.value)}
                                disabled={nfe.labelStatus === 'loading'}
                              />
                              <button
                                onClick={() => handleSaveAndGenerate(nfe)}
                                disabled={nfe.labelStatus === 'loading'}
                                className="bg-brand-teal hover:bg-brand-teal/90 disabled:bg-slate-300 text-white px-4 min-h-[36px] flex items-center justify-center rounded-xl font-bold transition-all active:scale-95"
                              >
                                Salvar
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Rastreio */}
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-semibold tracking-[0.06em] uppercase text-[#8ea8aa] mb-0.5">Rastreio</span>
                        <div className="flex items-center gap-2">
                          {nfe.rastreio ? (
                            <>
                              <div className="bg-[#eef7f8] px-[14px] py-[8px] flex items-center min-h-[36px] rounded-xl border-[1.5px] border-brand-teal text-brand-teal font-mono font-bold tracking-wide text-[14px]">
                                <Truck size={14} className="mr-2" />
                                {nfe.rastreio}
                              </div>
                              <button
                                onClick={() => handleUpdateTracking(nfe)}
                                className="p-1 text-brand-teal hover:text-brand-teal/80 transition-colors"
                              >
                                <RotateCw size={14} className={nfe.labelStatus === 'loading' ? 'animate-spin' : ''} />
                              </button>
                            </>
                          ) : (
                            <span className="italic text-slate-400 min-h-[36px] flex items-center"><Truck size={14} className="text-slate-400 mr-2" /> rastreio pendente</span>
                          )}
                        </div>

                        {/* Status de Envio com Dropdown - todos os pedidos da planilha */}
                        {nfe.isSpreadsheet && (() => {
                          const STATUS_OPTS = [
                            { value: 'Em separação', color: 'text-slate-600 bg-slate-100 border-slate-300', dot: 'bg-slate-400' },
                            { value: 'Enviado',       color: 'text-brand-teal bg-brand-teal/10 border-brand-teal/40', dot: 'bg-brand-teal' },
                          ];
                          const current = nfe.statusSeparacao || (nfe.marcadoSeparado ? 'Enviado' : null);
                          const opt = STATUS_OPTS.find(o => o.value === current) || null;
                          return (
                            <div className="mt-2 relative">
                              {nfe.separandoLoading ? (
                                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-teal/10 border border-brand-teal/20 text-brand-teal text-[11px] font-bold">
                                  <Loader2 size={11} className="animate-spin" />
                                  Salvando...
                                </div>
                              ) : current && opt ? (
                                <>
                                  <button
                                    onClick={() => setNfes(prev => prev.map(n => n.compl.nIdNF === nfe.compl.nIdNF ? { ...n, statusDropdownOpen: !n.statusDropdownOpen } : n))}
                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold transition-all hover:opacity-80 active:scale-95 ${opt.color}`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${opt.dot}`} />
                                    {current}
                                    <ChevronDown size={10} className={`transition-transform ${nfe.statusDropdownOpen ? 'rotate-180' : ''}`} />
                                  </button>
                                  {nfe.statusDropdownOpen && (
                                    <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-slate-100 py-1 min-w-[160px]">
                                      {STATUS_OPTS.map(o => (
                                        <button
                                          key={o.value}
                                          onClick={() => handleMarcarSeparado(nfe, o.value)}
                                          className={`w-full flex items-center gap-2 px-3 py-2 text-[11px] font-bold hover:bg-slate-50 transition-colors text-left ${
                                            o.value === current ? 'opacity-50 cursor-default' : ''
                                          }`}
                                        >
                                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${o.dot}`} />
                                          {o.value}
                                          {o.value === current && <CheckCircle2 size={10} className="ml-auto text-brand-teal" />}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <button
                                  onClick={() => handleMarcarSeparado(nfe, 'Enviado')}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-teal/10 border border-brand-teal/30 text-brand-teal hover:bg-brand-teal hover:text-white text-[11px] font-bold transition-all duration-200 active:scale-95"
                                >
                                  <CheckCircle2 size={11} />
                                  Marcar como enviado
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* Observations / Status Messages */}
                    <div className="flex flex-col gap-2 mt-2">
                      {/* Missing NF or Error Status */}
                      {nfe.isSpreadsheet && (!nfe.ide?.nNF || (nfe.status && nfe.status !== "NF Emitida")) && (
                        <div className={`flex items-start gap-2 p-2 rounded-md border text-xs font-medium w-full ${
                          nfe.status?.toUpperCase().includes('ERRO') || 
                          nfe.status?.toLowerCase().includes('não encontrado') || 
                          nfe.status?.toLowerCase().includes('incompleto') || 
                          nfe.status?.toLowerCase().includes('não localizado') ||
                          nfe.status?.toLowerCase().includes('nenhuma nf') 
                            ? 'bg-red-50 text-red-700 border-red-100' : 'bg-orange-50 text-orange-700 border-orange-100'
                        }`}>
                          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span>{nfe.status || "Aguardando emissão de nota fiscal"}</span>
                        </div>
                      )}
                      
                      {/* Observações da planilha */}
                      {nfe.observacoes && (
                        <div className={`flex items-start gap-2 p-2 rounded-md border text-xs font-medium w-full ${
                          nfe.observacoes.toUpperCase().includes("MANUTENÇÃO") || nfe.observacoes.toUpperCase().includes("MANUTENCAO") 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                            : 'bg-amber-50 text-amber-700 border-amber-100'
                        }`}>
                          {nfe.observacoes.toUpperCase().includes("MANUTENÇÃO") || nfe.observacoes.toUpperCase().includes("MANUTENCAO") ? (
                            <Settings className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          ) : (
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          )}
                          <span>{nfe.observacoes}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Prazo & Action */}
                  <div className="flex flex-col self-center justify-center items-start lg:items-end lg:w-[25%] pt-4 lg:pt-0 w-full gap-4">
                    {/* Prazo */}
                    <div className="flex flex-col items-start lg:items-end w-full">
                      <span className="text-[10px] font-semibold tracking-[0.06em] uppercase text-[#8ea8aa] mb-0.5">
                        {nfe.isSpreadsheet ? "Prazo de despacho" : "Faturamento"}
                      </span>
                      <span className="text-[22px] font-bold text-slate-800 mt-0.5">
                        {nfe.isSpreadsheet ? nfe.deadline : nfe.ide?.dEmi}
                      </span>
                      
                      {nfe.isSpreadsheet && (
                        <div className={`mt-2 px-[14px] py-[6px] rounded-lg text-[13px] font-bold flex items-center justify-center gap-2 w-fit ${
                          nfe.priority === 'Atrasado' || nfe.priority === 'Crítico' || (nfe.daysLeft || 0) < 0
                            ? 'bg-red-50 text-red-600'
                            : (nfe.daysLeft || 0) <= 1
                              ? 'bg-red-50 text-red-600'
                              : (nfe.daysLeft || 0) < 3
                                ? 'bg-amber-50 text-amber-600'
                                : 'bg-teal-50 text-teal-700'
                        }`}>
                          {(nfe.priority === 'Atrasado' || nfe.priority === 'Crítico' || (nfe.daysLeft || 0) <= 1) ? (
                            <span className="text-[14px] animate-pulse">🚨</span>
                          ) : (nfe.daysLeft || 0) >= 3 ? (
                            <Calendar size={14} className="text-teal-600" />
                          ) : (
                            <span className="text-[14px]">✅</span>
                          )}
                          <span>
                            {nfe.daysLeft && nfe.daysLeft > 0 
                              ? `${nfe.daysLeft} ${nfe.daysLeft === 1 ? 'dia útil' : 'dias úteis'}` 
                              : nfe.priority === 'Atrasado' || (nfe.daysLeft || 0) < 0 ? 'Atrasado' : 'Vence hoje'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="w-full flex justify-start lg:justify-end">
                      {nfe.modulo === 'servicos' ? (
                        <div className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-500 w-full lg:w-auto justify-center">
                          <FileText size={16} />
                          <span className="text-xs font-bold uppercase">Apenas NFS-e</span>
                        </div>
                      ) : nfe.rastreio ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDownloadZpl(nfe);
                          }}
                          className="flex items-center gap-2 bg-brand-teal border border-brand-teal hover:bg-brand-teal/90 text-white px-6 py-2 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 w-full lg:w-auto justify-center"
                        >
                          <Printer size={16} />
                          Imprimir
                        </button>
                      ) : nfe.labelStatus === 'loading' ? (
                        <div className="flex items-center gap-2 px-6 py-2 border border-brand-teal bg-teal-50 text-brand-teal rounded-lg w-full lg:w-auto justify-center">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="text-xs font-bold uppercase">Gerando...</span>
                        </div>
                      ) : nfe.status === "NF Emitida" && !nfe.rastreio ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleGenerateLabel(nfe);
                          }}
                          className="flex items-center gap-2 bg-brand-teal border border-brand-teal hover:bg-brand-teal/90 text-white px-6 py-2 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 w-full lg:w-auto justify-center"
                        >
                          <Printer size={16} />
                          Gerar Etiqueta
                        </button>
                      ) : (nfe.labelStatus === 'error' || (nfe.isSpreadsheet && nfe.status && (nfe.status.includes('não') || nfe.status.includes('incompleto') || nfe.status.includes('ERRO')) && !nfe.rastreio)) ? (
                        <div 
                          className="inline-flex items-center justify-center gap-2 px-6 py-2 rounded-lg text-xs font-bold border border-red-200 text-red-600 bg-red-50 cursor-help w-full lg:w-auto" 
                          title={nfe.labelError || nfe.status}
                        >
                          Erro
                        </div>
                      ) : (
                        <div className="inline-flex items-center justify-center px-6 py-2 rounded-lg text-xs font-bold border border-brand-teal text-brand-teal bg-white shadow-sm w-full lg:w-auto">
                          Aguardando
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center text-slate-400 text-xs">
          <p>© 2026 Expedição Neurobots • Desenvolvido para automação de DANFEs</p>
        </footer>

        {/* Approval Modal */}
        <EditErrorBoundary>
          <ApprovalModal 
            isOpen={approvalModal?.isOpen || false}
            onClose={() => setApprovalModal(null)}
            onConfirm={approvalModal?.onConfirm || (() => {})}
            title={approvalModal?.title || ""}
            description={approvalModal?.description || ""}
          />
        </EditErrorBoundary>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center max-w-md"
              >
                <div className="w-20 h-20 bg-brand-teal/10 rounded-3xl flex items-center justify-center text-brand-teal mx-auto mb-6">
                  <Truck size={40} />
                </div>
                <h2 className="text-3xl font-black text-slate-900 mb-4 uppercase tracking-tighter">Acompanhamento de Entregas</h2>
                <p className="text-slate-500 font-medium">
                  Nesta área será possível acompanhar os rastreios e status das entregas geradas pelo sistema.
                </p>
                <div className="mt-10 p-6 bg-white rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500">
                    <MapPin size={24} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-black uppercase text-slate-400 tracking-widest">Próxima Funcionalidade</p>
                    <p className="text-sm font-bold text-slate-700">Rastreamento em tempo real em breve.</p>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

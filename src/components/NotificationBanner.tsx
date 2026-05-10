import { Calendar, PackageCheck, TrendingUp, Activity, FileText, ShoppingBag, AlertCircle } from "lucide-react";
import { motion } from "motion/react";

interface InvoicedItem {
  invoice_number: string;
  recipient_name: string;
  modulo?: 'vendas' | 'servicos';
}

interface NotificationBannerProps {
  totalInPeriod: number;
  lastInvoicedDate?: string;
  vendasCount?: number;
  servicosCount?: number;
  pedidosEmSeparacao?: number;
  myobotsEmSeparacao?: number;
  exobotsEmSeparacao?: number;
  descartaveisEmSeparacao?: number;
  pedidosAtrasados?: number;
}

export default function NotificationBanner({ 
  totalInPeriod = 0, 
  lastInvoicedDate,
  vendasCount = 0,
  servicosCount = 0,
  pedidosEmSeparacao = 0,
  myobotsEmSeparacao = 0,
  exobotsEmSeparacao = 0,
  descartaveisEmSeparacao = 0,
  pedidosAtrasados = 0
}: NotificationBannerProps) {
  return (
    <div className="mb-8 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Última Emissão - AZUL */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-brand-blue rounded-[2rem] p-6 shadow-xl shadow-brand-blue/20 border border-white/10 relative overflow-hidden group"
        >
          <div className="absolute -right-8 -top-8 w-48 h-48 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-colors duration-500" />
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white border border-white/10 backdrop-blur-sm">
                  <Calendar className="w-5 h-5" />
                </div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Última Emissão</p>
              </div>
              <div className="flex items-center gap-1 text-white bg-white/20 px-2 py-1 rounded-lg border border-white/10 backdrop-blur-sm">
                <Activity className="w-3 h-3" />
                <span className="text-[9px] font-black uppercase">Sincronizado</span>
              </div>
            </div>

            <div className="mb-6">
              <h2 className="text-4xl font-black text-white tracking-tighter leading-none">
                {lastInvoicedDate || "---"}
              </h2>
              <p className="text-[10px] font-medium text-white/40 uppercase tracking-widest mt-2">Data da última nota faturada no Omie</p>
            </div>

            <div className="pt-6 border-t border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-black uppercase text-white/60 tracking-widest">API Ativa</span>
              </div>
              <span className="text-[9px] font-bold text-white/30 uppercase tracking-tighter">Expedição v2.4</span>
            </div>
          </div>
        </motion.div>

        {/* Card 2: Total no Período - ROXO */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-brand-purple rounded-[2rem] p-6 shadow-xl shadow-brand-purple/20 border border-white/10 relative overflow-hidden group flex flex-col justify-between"
        >
          <div className="absolute -right-8 -top-8 w-48 h-48 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-colors duration-500" />
          
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white border border-white/10 backdrop-blur-sm">
                <PackageCheck className="w-5 h-5" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">Total no Período</p>
            </div>

            <div className="flex items-end gap-4 mb-6">
              <h2 className="text-5xl font-black text-white tracking-tighter leading-none">
                {totalInPeriod}
              </h2>
              <div className="pb-1">
                <p className="text-xs font-bold text-white/60 uppercase tracking-widest leading-none">Notas</p>
                <p className="text-[10px] font-medium text-white/40 leading-none mt-1">Faturadas no intervalo selecionado</p>
              </div>
            </div>

            <div className="pt-6 border-t border-white/10 grid grid-cols-2 gap-4">
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase text-white/40 tracking-widest mb-1">Vendas</span>
                <span className="text-sm font-bold text-white">{vendasCount}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase text-white/40 tracking-widest mb-1">Serviços</span>
                <span className="text-sm font-bold text-white">{servicosCount}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Row 2: Pedidos em Separação - Dashboard Adicional */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-1"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-brand-teal/10 text-brand-teal rounded-lg">
              <ShoppingBag size={18} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total</span>
          </div>
          <p className="text-3xl font-black text-slate-900">{pedidosEmSeparacao}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Pedidos em Separação</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-1"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <TrendingUp size={18} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Myobots</span>
          </div>
          <p className="text-3xl font-black text-blue-600">{myobotsEmSeparacao}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Aguardando Envio</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.35 }}
          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-1"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <TrendingUp size={18} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Exobots</span>
          </div>
          <p className="text-3xl font-black text-emerald-600">{exobotsEmSeparacao}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Aguardando Envio</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-1"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
              <TrendingUp size={18} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Descartáveis</span>
          </div>
          <p className="text-3xl font-black text-purple-600">{descartaveisEmSeparacao}</p>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Aguardando Envio</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          className="bg-red-50 p-5 rounded-3xl border border-red-100 shadow-sm flex flex-col gap-1"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-red-100 text-red-600 rounded-lg">
              <AlertCircle size={18} />
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-red-400">Atraso</span>
          </div>
          <p className="text-3xl font-black text-red-600">{pedidosAtrasados}</p>
          <p className="text-[10px] font-bold text-red-500 uppercase tracking-tighter">Fora do Prazo Limite</p>
        </motion.div>
      </div>
    </div>
  );
}

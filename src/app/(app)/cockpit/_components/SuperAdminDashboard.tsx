"use client";

import { ShieldCheck, Building2, Users, Database, Globe, Zap, ArrowUpRight, LayoutDashboard, Settings } from "lucide-react"
import Link from "next/link"
import { useCockpitLastEvent } from "@/contexts/CockpitRealtimeContext"
import { useEffect, useState } from "react"

export default function SuperAdminDashboard({ userName, userId }: { userName: string, userId: string }) {
  const lastEvent = useCockpitLastEvent();
  const [highlightGlobal, setHighlightGlobal] = useState(false);

  useEffect(() => {
    if (lastEvent) {
      setHighlightGlobal(true);
      const timer = setTimeout(() => setHighlightGlobal(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [lastEvent]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-black tracking-tight text-white drop-shadow-sm flex items-center gap-3 italic uppercase text-indigo-500">
          Cockpit Supremo
          <span className="text-[10px] font-black py-1 px-3 bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20 tracking-widest">
            INFRASTRUCTURE
          </span>
        </h2>
        <p className="text-sm text-gray-400 font-medium font-sans">
          Bem-vindo ao centro de comando global, <span className="text-white font-bold">{userName}</span>. Status da rede e sistemas: <span className="text-[#80B828] font-bold">NOMINAL</span>.
        </p>
      </div>

      <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-4 transition-all ${highlightGlobal ? 'scale-[1.01]' : ''}`}>
        <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 shadow-sm relative overflow-hidden group hover:border-indigo-500/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-white">42</p>
          <p className="text-sm font-medium text-gray-500 mt-1">Empresas Ativas</p>
          <Link href="/cockpit/empresas" className="absolute inset-0 z-10" />
        </div>

        <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 shadow-sm relative overflow-hidden group hover:border-[#2BAADF]/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#2BAADF]/10 flex items-center justify-center text-[#2BAADF]">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-white">1.284</p>
          <p className="text-sm font-medium text-gray-500 mt-1">Usuários Totais</p>
        </div>

        <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 shadow-sm relative overflow-hidden group hover:border-orange-500/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
              <Zap className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-white">99.9%</p>
          <p className="text-sm font-medium text-gray-500 mt-1">Uptime Global</p>
        </div>

        <div className="rounded-2xl border border-[#ffffff0a] bg-[#111111] p-5 shadow-sm relative overflow-hidden group hover:border-red-500/30 transition-colors">
          <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500">
              <Database className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-white">4.2 TB</p>
          <p className="text-sm font-medium text-gray-500 mt-1">Storage Utilizado</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4">
        {/* Global Infrastructure Health */}
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 relative overflow-hidden">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-400" />
            Status da Infraestrutura SaaS
          </h3>
          <div className="space-y-4">
             {[
               { label: "Auth Service", status: "Operational", color: "#80B828" },
               { label: "CRM Multi-tenant Logic", status: "Operational", color: "#80B828" },
               { label: "Realtime Engine", status: "High Load", color: "#f97316" },
               { label: "Storage Bucket", status: "Operational", color: "#80B828" },
             ].map((svc, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[#ffffff03] border border-[#ffffff05]">
                   <span className="text-sm font-bold text-gray-300">{svc.label}</span>
                   <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase text-gray-500">{svc.status}</span>
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: svc.color }} />
                   </div>
                </div>
             ))}
          </div>
        </div>

        {/* Admin Quick Options */}
        <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 relative overflow-hidden">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-400" />
            Configurações do Sistema
          </h3>
          <div className="grid grid-cols-2 gap-4">
             <Link href="/cockpit/usuarios" className="p-4 rounded-xl bg-[#ffffff03] border border-[#ffffff0a] hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all flex flex-col gap-3 group">
                <ShieldCheck className="w-6 h-6 text-gray-400 group-hover:text-indigo-500" />
                <span className="text-sm font-bold text-gray-300">Segurança Global</span>
             </Link>
             <Link href="/cockpit/layout" className="p-4 rounded-xl bg-[#ffffff03] border border-[#ffffff0a] hover:bg-orange-500/10 hover:border-orange-500/30 transition-all flex flex-col gap-3 group">
                <LayoutDashboard className="w-6 h-6 text-gray-400 group-hover:text-orange-500" />
                <span className="text-sm font-bold text-gray-300">Template Engine</span>
             </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

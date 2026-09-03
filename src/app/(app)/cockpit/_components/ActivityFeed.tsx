"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Clock,
  Edit2,
  CheckCircle2,
  ListTodo,
  LayoutGrid,
  List,
} from "lucide-react";
import Link from "next/link";
import { useWorkflowActivity } from "@/hooks/useWorkflowActivity";
import {
  formatDistanceToNow,
  isPast,
  isToday,
  parseISO,
  isBefore,
  startOfToday,
  isAfter,
} from "date-fns";
import { ptBR } from "date-fns/locale";

interface ActivityFeedProps {
  userId: string;
}

type ActivityVariant = "overdue" | "today" | "inProgress";
type ViewMode = "columns" | "list";
type ListFilter = "all" | ActivityVariant;

const LIST_AUTO_THRESHOLD = 5;
const VIEW_STORAGE_KEY = "cockpit-activity-view";

type ActivityItem = {
  id: string;
  titulo: string;
  data_prazo?: string | null;
  pipeline_id: string;
  pipelines?: { nome?: string } | null;
  pipeline_stages?: { nome?: string } | null;
  variant: ActivityVariant;
};

type WorkflowActivityRow = Omit<ActivityItem, "variant"> & {
  pipelines?: { nome?: string } | { nome?: string }[] | null;
  pipeline_stages?: { nome?: string } | { nome?: string }[] | null;
};

function normalizeRelation<T extends { nome?: string }>(
  value: T | T[] | null | undefined
): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function toActivityItem(row: WorkflowActivityRow): ActivityItem {
  return {
    id: row.id,
    titulo: row.titulo,
    data_prazo: row.data_prazo,
    pipeline_id: row.pipeline_id,
    pipelines: normalizeRelation(row.pipelines),
    pipeline_stages: normalizeRelation(row.pipeline_stages),
    variant: "inProgress",
  };
}

function partitionActivities(activities: ActivityItem[], todayAtMidnight: Date) {
  const overdue: ActivityItem[] = [];
  const today: ActivityItem[] = [];
  const inProgress: ActivityItem[] = [];

  for (const a of activities) {
    if (!a.data_prazo) {
      inProgress.push({ ...a, variant: "inProgress" });
      continue;
    }
    const deadline = parseISO(a.data_prazo);
    if (isBefore(deadline, todayAtMidnight)) {
      overdue.push({ ...a, variant: "overdue" });
    } else if (isToday(deadline)) {
      today.push({ ...a, variant: "today" });
    } else if (isAfter(deadline, todayAtMidnight)) {
      inProgress.push({ ...a, variant: "inProgress" });
    }
  }

  const byDate = (x: ActivityItem, y: ActivityItem) =>
    new Date(x.data_prazo || 0).getTime() - new Date(y.data_prazo || 0).getTime();

  overdue.sort(byDate);
  today.sort(byDate);
  inProgress.sort((a, b) => {
    if (!a.data_prazo && !b.data_prazo) return a.titulo.localeCompare(b.titulo);
    if (!a.data_prazo) return -1;
    if (!b.data_prazo) return 1;
    return byDate(a, b);
  });

  return { overdue, today, inProgress };
}

export default function ActivityFeed({ userId }: ActivityFeedProps) {
  const { activities, isLoading, isSynced } = useWorkflowActivity(userId);
  const [viewMode, setViewMode] = useState<ViewMode>("columns");
  const [listFilter, setListFilter] = useState<ListFilter>("all");

  const todayAtMidnight = startOfToday();

  const partitioned = useMemo(() => {
    const items = (activities || []).map((a) => toActivityItem(a as WorkflowActivityRow));
    return partitionActivities(items, todayAtMidnight);
  }, [activities, todayAtMidnight]);

  const { overdue, today, inProgress } = partitioned;
  const totalCount = activities?.length ?? 0;

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === "columns" || saved === "list") {
      setViewMode(saved);
      return;
    }
    if (totalCount >= LIST_AUTO_THRESHOLD) {
      setViewMode("list");
    }
  }, [totalCount]);

  const setMode = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem(VIEW_STORAGE_KEY, mode);
  };

  const listItems: ActivityItem[] = useMemo(() => {
    const all = [...overdue, ...today, ...inProgress];
    if (listFilter === "all") return all;
    return all.filter((i) => i.variant === listFilter);
  }, [overdue, today, inProgress, listFilter]);

  if (isLoading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-11 bg-[#ffffff05] rounded-lg border border-[#ffffff0a]" />
        ))}
      </div>
    );
  }

  if (totalCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center bg-[#ffffff02] border border-dashed border-[#ffffff0a] rounded-3xl">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 mb-6 border border-green-500/20">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <p className="text-base font-black text-white uppercase tracking-tighter">Fluxo totalmente limpo</p>
        <p className="text-[11px] text-gray-500 mt-2 font-medium">
          Você concluiu todas as pendências para este período!
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col min-h-0 space-y-3">
      <div className="flex-shrink-0 flex items-center justify-between gap-2 px-1 bg-[#111111] z-10 pb-1">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${isSynced ? "bg-green-500 animate-pulse" : "bg-gray-600"}`}
          />
          <span className="text-[9px] font-black uppercase text-gray-500 tracking-[0.15em] truncate">
            {isSynced ? "Sincronizado em Tempo Real" : "Conectando…"}
          </span>
          <span className="text-[9px] font-bold text-gray-600 bg-[#ffffff05] px-1.5 py-0.5 rounded-full shrink-0">
            {totalCount}
          </span>
        </div>

        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#ffffff05] border border-[#ffffff0a] shrink-0">
          <button
            type="button"
            onClick={() => setMode("list")}
            title="Lista compacta"
            className={`p-1.5 rounded-md transition-all ${
              viewMode === "list"
                ? "bg-[#2BAADF]/20 text-[#2BAADF]"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setMode("columns")}
            title="Colunas por prioridade"
            className={`p-1.5 rounded-md transition-all ${
              viewMode === "columns"
                ? "bg-[#2BAADF]/20 text-[#2BAADF]"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {viewMode === "list" && (
        <div className="flex-shrink-0 flex flex-wrap gap-1.5">
          {(
            [
              ["all", "Todos", totalCount],
              ["overdue", "Atrasados", overdue.length],
              ["today", "Hoje", today.length],
              ["inProgress", "Em andamento", inProgress.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setListFilter(key)}
              className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border transition-all ${
                listFilter === key
                  ? "bg-[#2BAADF]/15 text-[#2BAADF] border-[#2BAADF]/30"
                  : "bg-[#ffffff03] text-gray-500 border-[#ffffff08] hover:border-[#ffffff15]"
              }`}
            >
              {label} ({count})
            </button>
          ))}
        </div>
      )}

      {viewMode === "list" ? (
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar-activity divide-y divide-[#ffffff06]">
          {listItems.length === 0 ? (
            <p className="text-center text-[11px] text-gray-600 py-8 italic">Nenhum card neste filtro.</p>
          ) : (
            listItems.map((card) => <ActivityListRow key={card.id} card={card} variant={card.variant} />)
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <ActivityColumn
            title="Atrasados"
            color="red"
            count={overdue.length}
            emptyIcon={CheckCircle2}
            emptyText="Sem atrasos críticos"
            items={overdue}
            variant="overdue"
          />
          <ActivityColumn
            title="Hoje"
            color="orange"
            count={today.length}
            emptyIcon={Clock}
            emptyText="Agenda do dia limpa"
            items={today}
            variant="today"
          />
          <ActivityColumn
            title="Em andamento"
            color="cyan"
            count={inProgress.length}
            emptyIcon={ListTodo}
            emptyText="Nenhum card em aberto"
            items={inProgress}
            variant="inProgress"
          />
        </div>
      )}
    </div>
  );
}

function ActivityColumn({
  title,
  color,
  count,
  emptyIcon: EmptyIcon,
  emptyText,
  items,
  variant,
}: {
  title: string;
  color: "red" | "orange" | "cyan";
  count: number;
  emptyIcon: React.ComponentType<{ className?: string }>;
  emptyText: string;
  items: ActivityItem[];
  variant: ActivityVariant;
}) {
  const dotClass =
    color === "red"
      ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]"
      : color === "orange"
        ? "bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.4)]"
        : "bg-[#2BAADF] shadow-[0_0_10px_rgba(43,170,223,0.4)]";
  const titleClass =
    color === "red" ? "text-red-500" : color === "orange" ? "text-orange-500" : "text-[#2BAADF]";

  return (
    <div className="h-full flex flex-col min-h-0 max-h-[420px] lg:max-h-none">
      <div className="flex-shrink-0 flex items-center justify-between pb-2 border-b border-[#ffffff0a] mb-2 sticky top-0 bg-[#111111] z-10">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded ${dotClass}`} />
          <h4 className={`text-[10px] font-black uppercase tracking-widest ${titleClass}`}>{title}</h4>
        </div>
        <span className="text-[10px] font-bold text-gray-600 bg-[#ffffff05] px-2 py-0.5 rounded-full">
          {count}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar-activity min-h-0">
        {items.length > 0 ? (
          items.map((card) => <ActivityCardRow key={card.id} card={card} variant={variant} />)
        ) : (
          <div className="py-8 border border-dashed border-[#ffffff05] rounded-2xl flex flex-col items-center justify-center opacity-30">
            <EmptyIcon className="w-6 h-6 mb-1" />
            <p className="text-[9px] uppercase font-black text-center px-2">{emptyText}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function getTimeLabel(variant: ActivityVariant, deadline: Date | null, compact = false) {
  const isActuallyPast = deadline ? isPast(deadline) : false;
  if (compact) {
    if (variant === "overdue") return deadline ? "Atrasado" : "Atrasado";
    if (variant === "today") return isActuallyPast ? "Hoje !" : "Hoje";
    if (deadline) {
      return deadline.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    }
    return "—";
  }
  if (variant === "overdue" && deadline) {
    return `Atrasado há ${formatDistanceToNow(deadline, { locale: ptBR })}`;
  }
  if (variant === "today" && deadline) {
    return `Vence hoje${isActuallyPast ? " (vencido)" : ""}`;
  }
  if (deadline) {
    return deadline.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  }
  return "Sem prazo";
}

function variantStyles(variant: ActivityVariant) {
  if (variant === "overdue") {
    return {
      dot: "bg-red-500",
      badge: "bg-red-500/10 text-red-500 border-red-500/20",
      text: "text-red-500",
      label: "Atrasado",
    };
  }
  if (variant === "today") {
    return {
      dot: "bg-orange-500",
      badge: "bg-orange-500/10 text-orange-500 border-orange-500/20",
      text: "text-orange-500",
      label: "Hoje",
    };
  }
  return {
    dot: "bg-[#2BAADF]",
    badge: "bg-[#2BAADF]/10 text-[#2BAADF] border-[#2BAADF]/20",
    text: "text-[#2BAADF]",
    label: "Andamento",
  };
}

function ActivityListRow({ card, variant }: { card: ActivityItem; variant: ActivityVariant }) {
  const deadline = card.data_prazo ? parseISO(card.data_prazo) : null;
  const timeText = getTimeLabel(variant, deadline, true);
  const styles = variantStyles(variant);
  const meta = `${card.pipelines?.nome || "Op."} · ${card.pipeline_stages?.nome || "Etapa"}`;

  return (
    <Link
      href={`/cockpit/crm/funis/${card.pipeline_id}?cardId=${card.id}`}
      title={`${card.titulo} — ${meta} — ${timeText}`}
      className="group flex items-center gap-2 px-1 py-1.5 min-h-[28px] hover:bg-[#ffffff05] transition-colors"
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styles.dot}`} />
      <span className="text-[11px] font-semibold text-white truncate min-w-0 flex-[1.2] group-hover:text-[#2BAADF]">
        {card.titulo}
      </span>
      <span className="text-[10px] text-gray-600 truncate min-w-0 flex-[0.8]">
        {meta}
      </span>
      <span className={`text-[9px] font-bold shrink-0 tabular-nums ${styles.text}`}>
        {timeText}
      </span>
    </Link>
  );
}

function ActivityCardRow({ card, variant }: { card: ActivityItem; variant: ActivityVariant }) {
  const deadline = card.data_prazo ? parseISO(card.data_prazo) : null;
  const timeText = getTimeLabel(variant, deadline);
  const styles = variantStyles(variant);

  return (
    <div className="group flex items-center justify-between gap-2 p-3 rounded-xl bg-[#ffffff03] hover:bg-[#ffffff08] border border-[#ffffff05] hover:border-[#2BAADF]/25 transition-all">
      <div className="flex-1 min-w-0">
        <p className="text-[9px] text-gray-600 truncate mb-0.5">
          {card.pipelines?.nome || "Operação"} › {card.pipeline_stages?.nome || "Etapa"}
        </p>
        <h5 className="text-[12px] font-bold text-white truncate group-hover:text-[#2BAADF] transition-colors">
          {card.titulo}
        </h5>
        <span className={`inline-block mt-1.5 text-[9px] font-black px-1.5 py-0.5 rounded border uppercase ${styles.badge}`}>
          {timeText}
        </span>
      </div>
      <Link
        href={`/cockpit/crm/funis/${card.pipeline_id}?cardId=${card.id}`}
        className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#ffffff05] hover:bg-[#2BAADF] text-gray-500 hover:text-white border border-[#ffffff10] transition-all shrink-0"
        title="Abrir card"
      >
        <Edit2 className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}

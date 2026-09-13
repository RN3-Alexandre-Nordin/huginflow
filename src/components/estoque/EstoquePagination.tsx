import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'

type Props = {
  page: number
  pageSize: number
  total: number
  /** Query string sem `page` (já montada) */
  baseQuery: string
}

export default function EstoquePagination({ page, pageSize, total, baseQuery }: Props) {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / pageSize))
  if (totalPages <= 1 && total <= pageSize) return null

  const hrefFor = (p: number) => {
    const qs = new URLSearchParams(baseQuery)
    if (p <= 1) qs.delete('page')
    else qs.set('page', String(p))
    const s = qs.toString()
    return s ? `?${s}` : '?'
  }

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-[#ffffff08] mt-2">
      <p className="text-[11px] text-gray-500 font-mono">
        {total === 0 ? '0 registros' : `${from}–${to} de ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={hrefFor(page - 1)}
          aria-disabled={page <= 1}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            page <= 1
              ? 'pointer-events-none opacity-40 border-[#ffffff08] text-gray-600'
              : 'border-[#ffffff15] text-gray-300 hover:bg-[#ffffff08] hover:text-white'
          }`}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Anterior
        </Link>
        <span className="text-[11px] text-gray-500 font-mono px-1">
          {page}/{totalPages}
        </span>
        <Link
          href={hrefFor(page + 1)}
          aria-disabled={page >= totalPages}
          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            page >= totalPages
              ? 'pointer-events-none opacity-40 border-[#ffffff08] text-gray-600'
              : 'border-[#ffffff15] text-gray-300 hover:bg-[#ffffff08] hover:text-white'
          }`}
        >
          Próxima
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  )
}

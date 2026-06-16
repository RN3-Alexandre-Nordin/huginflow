'use client'

import { useState, useEffect, useTransition } from 'react'
import { BookOpen, Plus, Trash2, FileText, Upload, CheckCircle2, AlertCircle, Loader2, X, FileCheck, Download } from 'lucide-react'
import { getKnowledgeBase, upsertKnowledge, deleteKnowledge } from './actions'
import { useRouter } from 'next/navigation'
import { getMyProfile } from '@/app/(app)/cockpit/actions'
import { hasPermission } from '@/utils/permissions'

export default function KnowledgeBasePage() {
  const [items, setItems] = useState<any[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [uploadType, setUploadType] = useState<'text' | 'pdf'>('text')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [profile, setProfile] = useState<any>(null)
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(true)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      const myProfile = await getMyProfile()
      setProfile(myProfile)
      setIsCheckingPermissions(false)
      
      if (hasPermission(myProfile, 'conhecimento', 'view')) {
        loadItems()
      } else {
        setIsLoading(false)
      }
    }
    init()
  }, [])

  async function loadItems() {
    setIsLoading(true)
    try {
      const data = await getKnowledgeBase()
      setItems(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      if (file.type !== 'application/pdf') {
        setError('Por favor, selecione apenas arquivos PDF.')
        setSelectedFile(null)
        return
      }
      setSelectedFile(file)
      setError(null)
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    
    const formData = new FormData(e.currentTarget)
    
    // Validação extra no client
    if (uploadType === 'pdf' && !selectedFile) {
      setError('Por favor, selecione um arquivo PDF primeiro.')
      return
    }

    startTransition(async () => {
      try {
        const result = await upsertKnowledge(formData)
        if (result?.error) {
          setError(result.error)
        } else {
          setIsModalOpen(false)
          setSelectedFile(null)
          loadItems()
        }
      } catch (err: any) {
        setError('Erro inesperado: ' + err.message)
      }
    })
  }

  async function handleDownload(id: string, fileName: string) {
    setDownloadingId(id)
    setError(null)
    try {
      const response = await fetch(`/api/knowledge/${encodeURIComponent(id)}/download`)
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Falha ao baixar documento')
      }

      const blob = await response.blob()
      const disposition = response.headers.get('Content-Disposition')
      let downloadName = fileName
      const match = disposition?.match(/filename\*=UTF-8''([^;]+)|filename="([^"]+)"/)
      if (match) {
        downloadName = decodeURIComponent(match[1] || match[2] || fileName)
      }

      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = downloadName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao baixar documento')
    } finally {
      setDownloadingId(null)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Tem certeza que deseja remover este item da base de conhecimento?')) return
    
    try {
      await deleteKnowledge(id)
      setItems(items.filter(item => item.id !== id))
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (isCheckingPermissions) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#2BAADF]" />
        <p className="text-gray-500 font-medium">Validando acessos...</p>
      </div>
    )
  }

  const canView = hasPermission(profile, 'conhecimento', 'view')
  const canCreate = hasPermission(profile, 'conhecimento', 'create')
  const canDelete = hasPermission(profile, 'conhecimento', 'delete')

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] space-y-6 text-center animate-in fade-in zoom-in-95">
        <div className="w-24 h-24 bg-red-500/10 rounded-[32px] flex items-center justify-center border border-red-500/20 shadow-2xl shadow-red-500/10">
          <AlertCircle className="w-12 h-12 text-red-500" />
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl font-bold text-white tracking-tight">Acesso Interditado</h2>
          <p className="text-gray-400 max-w-md mx-auto text-lg">
            Seu grupo de acesso não possui permissão para visualizar a <span className="text-white font-semibold">Base de Conhecimento</span>.
          </p>
        </div>
        <button 
          onClick={() => window.history.back()}
          className="bg-[#ffffff08] hover:bg-[#ffffff12] text-white px-8 py-3 rounded-2xl font-bold transition-all border border-[#ffffff10]"
        >
          Voltar para Início
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-20 max-w-7xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
             <div className="p-2 bg-[#ffffff10] rounded-xl border border-[#ffffff20]">
                <BookOpen className="w-6 h-6 text-[#2BAADF]" />
             </div>
             Base de Conhecimento
          </h1>
          <p className="text-gray-400 mt-2 text-lg">
            Alimente o RAG com documentos e textos para treinar sua inteligência artificial.
          </p>
        </div>

        {canCreate && (
          <button 
            onClick={() => {
              setIsModalOpen(true)
              setError(null)
              setSelectedFile(null)
            }}
            className="flex items-center gap-2 bg-[#2BAADF] hover:bg-[#2090C0] text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-[#2BAADF]/20 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Novo Conhecimento
          </button>
        )}
      </div>

      {error && !isModalOpen && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      <div className="bg-[#111111]/80 border border-[#ffffff10] rounded-3xl overflow-hidden backdrop-blur-md">
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center gap-4 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-[#2BAADF]" />
            Carregando base de conhecimento...
          </div>
        ) : items.length === 0 ? (
          <div className="p-20 flex flex-col items-center justify-center text-center space-y-4">
            <div className="w-20 h-20 bg-[#ffffff05] rounded-3xl flex items-center justify-center border border-[#ffffff10]">
              <FileText className="w-10 h-10 text-gray-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Sua base está vazia</h3>
              <p className="text-gray-500 max-w-sm mt-2">
                Adicione textos ou manuais em PDF para que o Gemini aprenda sobre seu negócio.
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#ffffff05] border-b border-[#ffffff10]">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Conteúdo / Documento</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Categoria</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-center">IA Status</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ffffff08]">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-[#ffffff03] transition-colors group">
                  <td className="px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-[#ffffff05] rounded-xl flex items-center justify-center group-hover:bg-[#2BAADF]/10 transition-colors">
                        {item.file_name.toLowerCase().endsWith('.pdf') ? (
                          <FileCheck className="w-5 h-5 text-[#2BAADF]" />
                        ) : (
                          <FileText className="w-5 h-5 text-[#2BAADF]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-200 truncate">
                          {item.file_name}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-widest font-bold">
                          Enviado em {new Date(item.created_at).toLocaleDateString('pt-BR')} às {new Date(item.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <span className="bg-[#ffffff08] border border-[#ffffff10] text-gray-400 text-[11px] font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                      {item.category || 'Geral'}
                    </span>
                  </td>
                  <td className="px-6 py-5 text-center">
                    <div className="flex flex-col items-center gap-1 group/badge tooltip" data-tip="Embedding gerado no Supabase">
                      <CheckCircle2 className="w-5 h-5 text-[#80B828]" />
                      <span className="text-[9px] text-[#80B828]/50 font-bold uppercase tracking-tighter">Vectorized</span>
                    </div>
                  </td>
                  <td className="px-6 py-5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => handleDownload(item.id, item.file_name)}
                        disabled={downloadingId === item.id}
                        title="Baixar documento"
                        className="p-2 text-gray-500 hover:text-[#2BAADF] hover:bg-[#2BAADF]/10 rounded-lg transition-all disabled:opacity-40"
                      >
                        {downloadingId === item.id ? (
                          <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                          <Download className="w-5 h-5" />
                        )}
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          title="Excluir"
                          className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* MODAL PARA NOVO CONHECIMENTO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 overflow-y-auto">
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !isPending && setIsModalOpen(false)} />
          
          <div className="relative bg-[#0F0F0F] border border-[#ffffff10] rounded-[32px] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="h-1.5 w-full bg-[#2BAADF]/20 absolute top-0 left-0">
               <div className={`h-full bg-[#2BAADF] transition-all duration-700 ${isPending ? 'w-full' : 'w-0'}`} />
            </div>

            <form onSubmit={handleSubmit} className="p-8">
              <div className="flex justify-between items-center mb-8">
                <div>
                   <h2 className="text-2xl font-bold text-white">Alimentar Ragnar AI</h2>
                   <p className="text-gray-500 text-sm mt-1">Envie informações que serão usadas pela Mônica no chat.</p>
                </div>
                <button 
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-2 text-gray-500 hover:text-white transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {error && (
                <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block mb-3">Categoria</label>
                  <input 
                    name="category"
                    placeholder="Ex: Preços de Cervejas, FAQ Atendimento, Manuais Técnicos"
                    className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-gray-300 focus:outline-none focus:border-[#2BAADF]/50 transition-colors"
                    required
                  />
                </div>

                <div className="flex p-1 bg-[#0A0A0A] rounded-xl border border-[#ffffff10]">
                  <button 
                     type="button"
                     onClick={() => setUploadType('text')}
                     className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${uploadType === 'text' ? 'bg-[#2BAADF] text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    <FileText className="w-4 h-4" /> Texto Direto
                  </button>
                  <button 
                     type="button"
                     onClick={() => setUploadType('pdf')}
                     className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${uploadType === 'pdf' ? 'bg-[#2BAADF] text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    <Upload className="w-4 h-4" /> Arquivo PDF
                  </button>
                </div>

                <input type="hidden" name="type" value={uploadType} />

                {uploadType === 'text' ? (
                  <div>
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block mb-3">Conteúdo do Conhecimento</label>
                    <textarea 
                      name="content"
                      rows={8}
                      placeholder="Cole aqui as informações importantes, regras de negócio ou listas de preços..."
                      className="w-full bg-[#0A0A0A] border border-[#ffffff10] rounded-xl px-4 py-3 text-sm text-gray-300 focus:outline-none focus:border-[#2BAADF]/50 transition-colors resize-none leading-relaxed"
                      required={uploadType === 'text'}
                    />
                  </div>
                ) : (
                  <div className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-4 transition-all cursor-pointer group relative ${selectedFile ? 'border-[#80B828]/50 bg-[#80B828]/5' : 'border-[#ffffff10] hover:border-[#2BAADF]/30'}`}>
                    <input 
                      type="file" 
                      name="file" 
                      accept=".pdf"
                      onChange={handleFileChange}
                      required={uploadType === 'pdf'}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    
                    {selectedFile ? (
                      <>
                        <div className="w-16 h-16 bg-[#80B828]/20 rounded-2xl flex items-center justify-center">
                          <CheckCircle2 className="w-8 h-8 text-[#80B828]" />
                        </div>
                        <div>
                          <p className="text-white font-semibold line-clamp-1 px-4">{selectedFile.name}</p>
                          <p className="text-gray-500 text-sm mt-1 uppercase tracking-widest font-bold">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                          <p className="text-[#2BAADF] text-xs mt-3 font-bold">Clique para trocar o arquivo</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 bg-[#2BAADF]/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Upload className="w-8 h-8 text-[#2BAADF]" />
                        </div>
                        <div>
                          <p className="text-white font-semibold">Clique para selecionar PDF</p>
                          <p className="text-gray-500 text-sm mt-1">O Gemini irá ler o arquivo e converter em conhecimento RAG.</p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-10 flex gap-4">
                <button 
                  type="button"
                  disabled={isPending}
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-6 py-4 rounded-2xl text-sm font-bold text-gray-400 hover:text-white hover:bg-[#ffffff08] transition-all disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={isPending || (uploadType === 'pdf' && !selectedFile)}
                  className="flex-1 bg-[#2BAADF] hover:bg-[#2090C0] text-white px-6 py-4 rounded-2xl text-sm font-bold transition-all shadow-xl shadow-[#2BAADF]/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {uploadType === 'pdf' ? 'Extraindo e Vetorizando...' : 'Vetorizando...'}
                    </>
                  ) : (
                    'Salvar na Base'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

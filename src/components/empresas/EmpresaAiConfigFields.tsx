'use client'

import { Sparkles, Cpu, Clock } from 'lucide-react'
import { AI_MODELS, DEFAULT_AI_MODEL } from '@/lib/ai/empresa-ai'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full bg-[#0A0A0A] border border-[#ffffff12] focus:border-[#2BAADF] rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-all placeholder-gray-600 focus:ring-1 focus:ring-[#2BAADF]/30'

type EmpresaAiConfigFieldsProps = {
  defaultModel?: string | null
  defaultSilenceTimeout?: number | null
  defaultContextPrompt?: string | null
}

export default function EmpresaAiConfigFields({
  defaultModel,
  defaultSilenceTimeout,
  defaultContextPrompt,
}: EmpresaAiConfigFieldsProps) {
  const resolvedDefaultModel =
    defaultModel && AI_MODELS.some((m) => m.value === defaultModel)
      ? defaultModel
      : DEFAULT_AI_MODEL

  return (
    <div className="bg-[#111111] border border-[#ffffff0a] rounded-2xl p-6 space-y-5 relative overflow-hidden">
      <div
        className="absolute -top-20 -right-20 w-48 h-48 rounded-full opacity-[0.06] pointer-events-none"
        style={{
          background: 'radial-gradient(circle, #2BAADF 0%, transparent 70%)',
          filter: 'blur(30px)',
        }}
      />

      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-[#2BAADF]" />
        <div>
          <p className="text-sm font-semibold text-white">Cérebro IA (OpenAI)</p>
          <p className="text-xs text-gray-500">
            A chave da API fica apenas no servidor (.env). Aqui você define modelo e comportamento.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Modelo de IA">
          <div className="relative">
            <Cpu className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <select
              name="ai_model"
              defaultValue={resolvedDefaultModel}
              className={`${inputCls} pl-10 appearance-none bg-[#0A0A0A]`}
            >
              {AI_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </Field>

        <Field label="Tempo de Silêncio IA (min)">
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="number"
              name="ia_silence_timeout"
              defaultValue={defaultSilenceTimeout ?? 60}
              placeholder="60"
              className={`${inputCls} pl-10`}
            />
          </div>
        </Field>

        <div className="col-span-2">
          <Field label="Instruções de Contexto (System Prompt)">
            <textarea
              name="ai_context_prompt"
              rows={8}
              defaultValue={
                defaultContextPrompt ||
                'Você é o assistente virtual inteligente da empresa.\nSua missão é atender os clientes com cordialidade, tirar dúvidas sobre os serviços e ajudar na conversão de novos leads.'
              }
              placeholder="Defina a personalidade e as regras de negócio da IA..."
              className={`${inputCls} resize-y p-4 min-h-[150px] leading-relaxed italic`}
            />
            <p className="text-[10px] text-gray-600 mt-1 ml-1 font-medium italic">
              Embeddings usam OpenAI text-embedding-3-large (compatível com a base vetorial).
            </p>
          </Field>
        </div>
      </div>
    </div>
  )
}

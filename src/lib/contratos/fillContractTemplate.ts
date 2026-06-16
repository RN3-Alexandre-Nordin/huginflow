import { readFile } from 'fs/promises'
import path from 'path'
import type { ContractFillData } from './types'
import { escapeHtml } from './contractDataFromEmpresa'
import { RN3_CONTRATO } from './rn3-contrato'

const PLACEHOLDER_RE = /<span class="placeholder">\[PREENCHER(?::\s*([^\]]*))?\]<\/span>/gi

function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function resolveLabeledValue(label: string, data: ContractFillData): string {
  const l = normalizeLabel(label)

  if (/razao social/.test(l)) return data.razaoSocial
  if (/tipo societario/.test(l)) return data.tipoSocietario
  if (l === 'cnpj') return data.cnpj
  if (/endereco completo/.test(l)) return data.endereco
  if (/nome do representante/.test(l)) return data.representanteNome
  if (l === 'nacionalidade') return data.representanteNacionalidade
  if (/estado civil/.test(l)) return data.representanteEstadoCivil
  if (/profissao/.test(l)) return data.representanteProfissao
  if (l === 'cpf') return data.representanteCpf
  if (/cargo/.test(l)) return data.representanteCargo
  if (l === 'cidade') return data.cidade
  if (l === 'data' || /data do msa/.test(l)) return data.dataContrato
  if (/nome, cpf, cargo/.test(l)) return data.representanteLinha
  if (/representante rn3/.test(l)) return RN3_CONTRATO.representanteNome

  return ''
}

function fillWitnessesAndOsNumber(html: string, data: ContractFillData): string {
  let result = html

  result = result.replace(
    /(<p>1\. Nome:\s*)<span class="placeholder">\[PREENCHER\]<\/span>(\s*— CPF:\s*)<span class="placeholder">\[PREENCHER\]<\/span>/,
    `$1${filledSpan(data.testemunha1Nome)}$2${filledSpan(data.testemunha1Cpf)}`
  )

  result = result.replace(
    /(<p>2\. Nome:\s*)<span class="placeholder">\[PREENCHER\]<\/span>(\s*— CPF:\s*)<span class="placeholder">\[PREENCHER\]<\/span>/,
    `$1${filledSpan(data.testemunha2Nome)}$2${filledSpan(data.testemunha2Cpf)}`
  )

  result = result.replace(
    /(<h1 class="doc-title">)Template — Ordem de Serviço Nº <span class="placeholder">\[PREENCHER\]<\/span>/,
    `$1Ordem de Serviço Nº ${filledSpan(data.numeroOs, !data.numeroOs.trim())}`
  )

  return result
}

function fillQuadroResumoComercial(html: string, data: ContractFillData): string {
  const prazoVigencia =
    data.prazoVigencia ||
    '12 meses, com renovação automática por períodos sucessivos de 12 meses, salvo denúncia com 30 dias de antecedência'

  const setupMeioMissing =
    data.hasContratoComercial && data.meioPagamentoSetup !== '—' && !data.meioPagamentoSetup.trim()

  const setupCondicao = `${filledSpan(data.valorSetup, !data.valorSetup.trim())} — forma de pagamento: ${filledSpan(
    data.meioPagamentoSetup || '—',
    setupMeioMissing
  )}`

  const limiteCondicao = data.limiteUsuarios.trim()
    ? `${filledSpan(data.limiteUsuarios)} usuários`
    : filledSpan('', data.hasContratoComercial)

  const rows = [
    `<tr><td>Data de início da prestação</td><td>${filledSpan(data.dataInicioPrestacao, !data.dataInicioPrestacao.trim())}</td></tr>`,
    `<tr><td>Prazo de vigência</td><td>${prazoVigencia}</td></tr>`,
    `<tr><td>Plano contratado</td><td>${filledSpan(data.planoContratado, !data.planoContratado.trim())}</td></tr>`,
    `<tr><td>Valor do setup (one-time)</td><td>${setupCondicao}</td></tr>`,
    `<tr><td>Mensalidade</td><td>${filledSpan(data.valorMensalidade, !data.valorMensalidade.trim())}</td></tr>`,
    `<tr><td>Dia de vencimento</td><td>Dia ${filledSpan(data.diaVencimentoMensal, !data.diaVencimentoMensal.trim())} de cada mês</td></tr>`,
    `<tr><td>Forma de pagamento</td><td>Cartão de crédito recorrente (Stripe)</td></tr>`,
    `<tr><td>Reajuste</td><td>IPCA acumulado 12 meses, anualmente</td></tr>`,
    `<tr><td>Fair Use de IA</td><td>—</td></tr>`,
    `<tr><td>Valor do Excedente</td><td>—</td></tr>`,
    `<tr><td>Limite de Usuários Autorizados</td><td>${limiteCondicao}</td></tr>`,
  ].join('\n          ')

  return html.replace(
    /(<h2 class="clausula" id="os-3">3\. Quadro-Resumo Comercial<\/h2>[\s\S]*?<tbody>\s*)[\s\S]*?(\s*<\/tbody>)/,
    `$1${rows}$2`
  )
}

function fillServicosExtrasList(html: string, data: ContractFillData): string {
  const items = data.servicosExtras.filter((item) => item.descricao.trim())

  const content =
    items.length === 0
      ? '<p class="indent"><span class="filled-value">Nenhum serviço extra contratado nesta OS.</span></p>'
      : items
          .map((item, index) => {
            const letter = String.fromCharCode(97 + index)
            const text = item.observacao?.trim()
              ? `${item.descricao.trim()} (${item.observacao.trim()})`
              : item.descricao.trim()
            return `<p class="indent">(${letter}) <span class="filled-value">${escapeHtml(text)}</span>;</p>`
          })
          .join('\n\n      ')

  return html.replace(
    /<div id="servicos-extra-list">[\s\S]*?<\/div>/,
    `<div id="servicos-extra-list">\n      ${content}\n      </div>`
  )
}

function fillFocalPointsTable(html: string, data: ContractFillData): string {
  const nome = filledSpan(data.representanteNome)
  const email = filledSpan(data.representanteEmail)
  const telefone = filledSpan(data.representanteTelefone)

  const row = (funcao: string) =>
    `<tr><td>${funcao}</td><td>${nome}</td><td>${email}</td><td>${telefone}</td></tr>`

  const rows = [
    row('Ponto focal técnico do Cliente'),
    row('Ponto focal jurídico/LGPD do Cliente'),
    row('Ponto focal financeiro do Cliente'),
    row('Ponto focal RN3 (Customer Success)'),
  ].join('\n          ')

  return html.replace(
    /(<h2 class="clausula" id="os-7">7\. Pontos Focais<\/h2>[\s\S]*?<tbody>\s*)[\s\S]*?(\s*<\/tbody>)/,
    `$1${rows}$2`
  )
}

function fillSignatureBlocks(html: string, data: ContractFillData): string {
  let result = html

  // MSA — assinatura do Cliente (Representante, CPF, Cargo)
  result = result.replace(
    /(<p style="text-align: center;">Representante:\s*)<span class="placeholder">\[PREENCHER\]<\/span>(\s*<\/p>\s*<p style="text-align: center;">CPF:\s*)<span class="placeholder">\[PREENCHER\]<\/span>(\s*<\/p>\s*<p style="text-align: center;">Cargo:\s*)<span class="placeholder">\[PREENCHER\]<\/span>/,
    `$1${filledSpan(data.representanteNome)}$2${filledSpan(data.representanteCpf)}$3${filledSpan(data.representanteCargo)}`
  )

  // OS — assinatura da RN3
  result = result.replace(
    /(<p style="text-align: center; font-weight: 600;">RN3 INOVAÇÃO E TECNOLOGIA LTDA<\/p>\s*<p style="text-align: center;">Representante:\s*)<span class="placeholder">\[PREENCHER\]<\/span>(\s*<\/p>\s*<p style="text-align: center;">Data:\s*)<span class="placeholder">\[PREENCHER\]<\/span>/,
    `$1${filledSpan(RN3_CONTRATO.representanteNome)}$2${filledSpan(data.dataContrato)}`
  )

  // OS — assinatura do Cliente (razão social já preenchida no passo anterior)
  result = result.replace(
    /(<div class="assinatura-bloco">\s*<div class="assinatura-linha"><\/div>\s*<p style="text-align: center; font-weight: 600;"><span class="(?:filled-value|placeholder-missing)">[^<]*<\/span><\/p>\s*<p style="text-align: center;">Representante:\s*)<span class="placeholder">\[PREENCHER\]<\/span>(\s*<\/p>\s*<p style="text-align: center;">Data:\s*)<span class="placeholder">\[PREENCHER\]<\/span>/,
    `$1${filledSpan(data.representanteNome)}$2${filledSpan(data.dataContrato)}`
  )

  return result
}

function filledSpan(value: string, missing = false): string {
  const cls = missing || !value.trim() ? 'placeholder-missing' : 'filled-value'
  const display = value.trim() || '—'
  return `<span class="${cls}">${escapeHtml(display)}</span>`
}

/** Preenche placeholders rotulados e blocos conhecidos do Cliente (MSA + identificação na OS). */
export function fillContractTemplate(html: string, data: ContractFillData): string {
  let result = html.replace(PLACEHOLDER_RE, (_match, labelRaw?: string) => {
    const label = labelRaw?.trim() ?? ''
    if (!label) return _match
    const value = resolveLabeledValue(label, data)
    return filledSpan(value, !value.trim())
  })

  result = fillSignatureBlocks(result, data)
  result = fillWitnessesAndOsNumber(result, data)
  result = fillQuadroResumoComercial(result, data)
  result = fillServicosExtrasList(result, data)
  result = fillFocalPointsTable(result, data)

  // OS — identificação resumida do Cliente
  result = result.replace(
    /(<strong>Cliente:<\/strong>[\s\S]*?CNPJ\s*)<span class="placeholder">\[PREENCHER\]<\/span>/,
    `$1${filledSpan(data.cnpj)}`
  )

  return result
}

/** Remove um elemento HTML balanceando tags de abertura/fechamento. */
function removeBalancedElement(html: string, openTagPattern: RegExp): string {
  const openMatch = openTagPattern.exec(html)
  if (!openMatch || openMatch.index === undefined) return html

  const tagName = /^<(\w+)/i.exec(openMatch[0])?.[1]?.toLowerCase()
  if (!tagName) return html

  const start = openMatch.index
  let depth = 0
  let pos = start
  const openRe = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, 'gi')
  const closeRe = new RegExp(`</${tagName}>`, 'gi')

  while (pos < html.length) {
    openRe.lastIndex = pos
    closeRe.lastIndex = pos
    const nextOpen = openRe.exec(html)
    const nextClose = closeRe.exec(html)
    if (!nextClose) break

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1
      pos = nextOpen.index + nextOpen[0].length
      continue
    }

    depth -= 1
    if (depth === 0) {
      const end = nextClose.index + nextClose[0].length
      return html.slice(0, start) + html.slice(end).replace(/^\s+/, '')
    }
    pos = nextClose.index + nextClose[0].length
  }

  return html
}

export function stripContractChrome(html: string): string {
  let result = html

  result = removeBalancedElement(result, /<div class="toolbar"[\s>]/i)
  result = removeBalancedElement(result, /<nav class="toc"[\s>]/i)
  result = removeBalancedElement(result, /<div class="anotacoes"[\s>]/i)
  result = removeBalancedElement(result, /<div class="toast"[\s>]/i)
  result = result.replace(/<script>[\s\S]*?<\/script>\s*(?=<\/body>)/i, '')

  return result.replace(
      '</head>',
      `<style>
        .filled-value { font-weight: 600; color: #1a1a1a !important; }
        .placeholder-missing { color: #c0392b !important; font-style: italic; }
        .toolbar, .toc, .anotacoes { display: none !important; }
        .container { display: block !important; max-width: none !important; padding: 0 !important; grid-template-columns: 1fr !important; }
        body { background: #fff !important; color: #1a1a1a !important; }
        .document,
        .document p,
        .document h2,
        .document h3,
        .document li,
        .document td,
        .document .considerando,
        .document .doc-title {
          color: #1a1a1a !important;
        }
        .document table th { color: #444444 !important; }
        .document .section-label { color: #6b4423 !important; }
        .assinaturas, .assinatura-bloco { page-break-inside: avoid !important; break-inside: avoid !important; }
        .assinatura-linha::before { content: ''; display: block; height: 72px; }
        .assinatura-linha { border-bottom: 1px solid #1a1a1a; margin: 0 0 10px; }
        table.pontos-focais { page-break-inside: avoid !important; break-inside: avoid !important; }
        table.pontos-focais td { line-height: 1.5 !important; vertical-align: top !important; padding: 10px 12px !important; overflow: visible !important; }
        table.pontos-focais td:nth-child(3) { word-break: break-all !important; font-weight: 400 !important; font-size: 0.8rem !important; }
        table.pontos-focais .filled-value { font-weight: 400 !important; line-height: 1.5 !important; }
      </style></head>`
    )
}

/** Fragmento seguro para `dangerouslySetInnerHTML` (sem DOCTYPE/html/head). */
export function toContractViewerFragment(html: string): string {
  const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/gi)].map((match) => match[0])
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)
  const body = bodyMatch?.[1]?.trim() ?? html

  return styles.length ? `${styles.join('\n')}\n${body}` : body
}

export async function loadContractTemplate(): Promise<string> {
  const templatePath = path.join(process.cwd(), 'docs', 'contrato modelo.html')
  return readFile(templatePath, 'utf-8')
}

export async function buildFilledContractHtml(data: ContractFillData): Promise<string> {
  const raw = await loadContractTemplate()
  const filled = fillContractTemplate(raw, data)
  return toContractViewerFragment(stripContractChrome(filled))
}

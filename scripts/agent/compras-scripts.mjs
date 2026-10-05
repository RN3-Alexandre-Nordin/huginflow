/**
 * Compras — SCR-COM-F1 a F9. Uma rotina por fase do addon.
 * Grava e apaga só no tenant de teste, no projeto DEV.
 */
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { config as loadDotenv } from 'dotenv'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { normalizarCodigoEtiqueta } from '../../src/lib/compras/codigo-etiqueta.mjs'
import { assertDevTarget } from './test-env-guard.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')
for (const file of ['.env.local', '.env']) {
  const path = resolve(root, file)
  if (existsSync(path)) loadDotenv({ path, override: false })
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const EMAIL = process.env.TEST_EMAIL || process.env.MANUAL_EMAIL
const PASSWORD = process.env.TEST_PASSWORD || process.env.MANUAL_PASSWORD
const EXPECTED_TENANT = process.env.TEST_TENANT_ID
const runKey = process.env.TEST_RUN_ID || randomUUID()
const marker = `[agent-com:${runKey}]`
const runDir = process.env.TEST_RUN_DIR || resolve(root, 'docs/homologacao/execucoes', runKey)
const eventsPath = process.env.TEST_RUN_EVENTS_PATH || ''

const cases = []
const CATALOG = {
  'SCR-COM-F1-01': {
    area: 'Compras / Fase 1 Solicitar',
    expectation: 'Solicitação produtiva nasce com número SOL- do dia e item no tenant.',
    passos: 'Cria solicitação e item; tipo inválido é recusado; apaga a fixture.',
  },
  'SCR-COM-F2-01': {
    area: 'Compras / Fase 2 Pedir',
    expectation: 'Cotação elege um fornecedor e a aprovação do pedido registra quem decidiu.',
    passos: 'Cotação, proposta, pedido e com_pedido_aprovacoes; quarto fornecedor é recusado.',
  },
  'SCR-COM-F3-01': {
    area: 'Compras / Fase 3 Conferir',
    expectation: 'Recebimento parcial grava falta (recebido − pedido) e status recebido_parcial.',
    passos: 'Pedido aprovado; recebe menos que o pedido; confere divergencia_quantidade.',
  },
  'SCR-COM-F4-01': {
    area: 'Compras / Fase 4 Caixa e importados',
    expectation: 'CX- é da caixa; o código do fornecedor é outra leitura. O recebimento comum continua.',
    passos: 'Liga as duas formas, abre caixa, grava leitura e um recebimento comum; restaura o setup.',
  },
  'SCR-COM-F5-01': {
    area: 'Compras / Fase 5 Nota',
    expectation: 'Preço diferente marca aviso; frete entra no custo da última compra. Serviço não move saldo.',
    passos: 'Nota produtiva com frete e aviso_preco; nota de serviço sem cardex.',
  },
  'SCR-COM-F6-01': {
    area: 'Compras / Fase 6 Devolução',
    expectation: 'Devolução aceita trocado, avaria ou outro e não gera movimento de estoque.',
    passos: 'Grava DEV- com motivo outro; motivo fora da lista falha; cardex do SKU segue vazio.',
  },
  'SCR-COM-F7-01': {
    area: 'Compras / Fase 7 Pré-título',
    expectation: 'Nota confirmada gera um pré-título PT- aguardando AP. A segunda chamada não duplica.',
    passos: 'com_gravar_pre_titulo duas vezes; status aguardando_ap; sem título financeiro.',
  },
  'SCR-COM-F8-01': {
    area: 'Compras / Fase 8 Série na nota',
    expectation: 'A quantidade da nota só entra no estoque se houver uma série por unidade.',
    passos: 'Grava uma série, completa a segunda na linha e só então entra no estoque; saldo sem série não sai.',
  },
  'SCR-COM-F9-01': {
    area: 'Compras / Fase 9 Relatórios',
    expectation: 'Os nove relatórios devolvem página e resumo. Slug inválido e outra empresa são recusados.',
    passos: 'com_rpc_relatorio nos 9 slugs, com a fixture do dia visível no resumo.',
  },
}

const SLUGS = [
  'compras-por-tipo',
  'quem-liberou',
  'a-chegar',
  'divergencias',
  'preco-divergente',
  'devolucoes',
  'custo-ultima-compra',
  'pre-titulos-parados',
  'onde-esta-serie',
]

function appendEvent(event) {
  if (!eventsPath) return
  mkdirSync(dirname(eventsPath), { recursive: true })
  writeFileSync(eventsPath, `${JSON.stringify(event)}\n`, { flag: 'a' })
}

function record(id, status, error, durationMs) {
  const meta = CATALOG[id]
  const row = {
    id,
    title: `[${id}] ${meta.expectation}`,
    area: meta.area,
    expectation: `[${id}] ${meta.expectation}`,
    passos: meta.passos,
    status,
    error,
    durationMs,
  }
  cases.push(row)
  const passed = cases.filter((item) => item.status === 'passed').length
  const failed = cases.filter((item) => item.status === 'failed').length
  const skipped = cases.filter((item) => item.status === 'skipped').length
  appendEvent({
    ts: new Date().toISOString(),
    type: 'test_end',
    ...row,
    passed,
    failed,
    skipped,
    message: row.expectation,
  })
  const mark = status === 'passed' ? '✓' : status === 'skipped' ? '○' : '✗'
  console.log(`  ${mark} ${id}${error ? ` — ${error}` : ''}`)
}

function assertConfig() {
  const missing = []
  if (process.env.TEST_ALLOW_MUTATIONS !== '1') missing.push('TEST_ALLOW_MUTATIONS=1')
  if (!URL) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  if (!SERVICE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!EMAIL) missing.push('TEST_EMAIL')
  if (!PASSWORD) missing.push('TEST_PASSWORD')
  if (!EXPECTED_TENANT) missing.push('TEST_TENANT_ID')
  if (missing.length) throw new Error(`Preflight Compras: ausente ${missing.join(', ')}`)
  assertDevTarget()
}

function assertOk(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`)
}

function hojeSp() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

function divergenciaQuantidade(recebida, pedida) {
  return Math.round((recebida - pedida) * 10000) / 10000
}

function listarNumerosSerie(texto) {
  if (!texto) return []
  return String(texto)
    .split(/[\n,;]+/)
    .map((parte) => parte.trim())
    .filter(Boolean)
}

function seriesConferem(texto, quantidade) {
  const numeros = listarNumerosSerie(texto)
  if (!Number.isInteger(quantidade) || quantidade < 1) return false
  if (numeros.length !== quantidade) return false
  const vistos = new Set()
  for (const numero of numeros) {
    const chave = numero.toLowerCase()
    if (vistos.has(chave)) return false
    vistos.add(chave)
  }
  return true
}

function parseRpc(rpcRes, rpcErr) {
  if (rpcErr) return { ok: false, message: rpcErr.message }
  const raw = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'sem retorno' }
  const id = raw.movimento_id || raw.movimentoId
  const ok = Boolean(id) || raw.success === true || raw.sucesso === true
  return { ok, message: raw.mensagem || raw.message, raw }
}

async function loginPrincipal() {
  const client = createClient(URL, ANON_KEY)
  const { data: auth, error: loginError } = await client.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })
  assertOk(loginError, 'login')
  if (!auth.user) throw new Error('login sem usuário')
  const { data: me, error: meError } = await client
    .from('usuarios')
    .select('id, empresa_id, role_global, ativo')
    .eq('auth_user_id', auth.user.id)
    .eq('empresa_id', EXPECTED_TENANT)
    .single()
  assertOk(meError, 'perfil')
  if (!me?.empresa_id || me.ativo === false || me.role_global === 'superadmin') {
    throw new Error('Compras SCR exige admin de tenant, não superadmin')
  }
  return { client, me }
}

async function ensureComprasAddon(admin, empresaId) {
  const { data: existing } = await admin
    .from('empresa_addons')
    .select('empresa_id')
    .eq('empresa_id', empresaId)
    .eq('addon_codigo', 'compras')
    .maybeSingle()
  if (existing) {
    const { error } = await admin
      .from('empresa_addons')
      .update({
        enabled: true,
        commercial_status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('empresa_id', empresaId)
      .eq('addon_codigo', 'compras')
    assertOk(error, 'enable compras addon')
  } else {
    const { error } = await admin.from('empresa_addons').insert({
      empresa_id: empresaId,
      addon_codigo: 'compras',
      enabled: true,
      commercial_status: 'active',
    })
    assertOk(error, 'insert compras addon')
  }
}

async function proximoNumero(admin, empresaId, tabela, prefixoBase) {
  const prefixo = `${prefixoBase}-${hojeSp().replaceAll('-', '')}-`
  const { count, error } = await admin
    .from(tabela)
    .select('*', { count: 'exact', head: true })
    .eq('empresa_id', empresaId)
    .ilike('numero', `${prefixo}%`)
  assertOk(error, `contar ${tabela}`)
  return `${prefixo}${String((count || 0) + 1).padStart(4, '0')}`
}

async function criarFornecedor(client, me, rotulo) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8)
  const { data, error } = await client
    .from('crm_leads')
    .insert({
      empresa_id: me.empresa_id,
      nome: `${marker} ${rotulo} ${suffix}`,
      telefone: `55119${Date.now().toString().slice(-8)}`,
    })
    .select('id, nome')
    .single()
  assertOk(error, 'criar fornecedor')
  return data
}

async function criarSku(client, me, opts = {}) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8)
  const { data, error } = await client
    .from('cad_skus')
    .insert({
      empresa_id: me.empresa_id,
      codigo: `COM-${suffix}`,
      nome: `${marker} SKU ${suffix}`,
      tipo: 'produto',
      unidade_venda: 'UN',
      unidade_compra: 'UN',
      unidade_estoque: 'UN',
      controla_estoque: true,
      controla_lote: false,
      controla_serie: Boolean(opts.controla_serie),
      exige_validade: false,
      ativo: true,
    })
    .select('id, codigo')
    .single()
  assertOk(error, 'criar SKU')
  return data
}

async function criarPedido(client, admin, me, pessoa, sku, campos) {
  const numero = await proximoNumero(admin, me.empresa_id, 'com_pedidos', 'PC')
  const quantidade = campos.quantidade
  const preco = campos.preco
  const { data: pedido, error } = await client
    .from('com_pedidos')
    .insert({
      empresa_id: me.empresa_id,
      numero,
      fornecedor_id: pessoa.id,
      tipo: campos.tipo || 'produtivo',
      status: campos.status || 'aprovado',
      origem: campos.origem || 'direto',
      cotacao_id: campos.cotacaoId || null,
      codigo_fornecedor: campos.codigoFornecedor || null,
      valor_total: Math.round(quantidade * preco * 100) / 100,
      observacao: marker,
      criador_usuario_id: me.id,
    })
    .select('id, numero, status')
    .single()
  assertOk(error, 'criar pedido')
  const { data: item, error: itemErr } = await client
    .from('com_pedido_itens')
    .insert({
      empresa_id: me.empresa_id,
      pedido_id: pedido.id,
      sku_id: sku?.id || null,
      descricao: sku ? `${sku.codigo} ${marker}` : marker,
      quantidade,
      unidade: 'UN',
      preco_unitario: preco,
    })
    .select('id, quantidade, preco_unitario')
    .single()
  assertOk(itemErr, 'criar item do pedido')
  return { pedido, item }
}

async function localPrincipal(client, empresaId) {
  const { data, error } = await client
    .from('cad_locais_estoque')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .eq('eh_principal', true)
    .limit(1)
    .maybeSingle()
  assertOk(error, 'local principal')
  if (!data) throw new Error('Empresa sem local principal de estoque')
  return data.id
}

async function limpar(admin, empresaId, bag) {
  const pedidoIds = bag.pedidoIds || []
  for (const pedidoId of pedidoIds) {
    await admin.from('com_importado_leituras').delete().eq('empresa_id', empresaId).eq('pedido_id', pedidoId)
    const { data: caixas } = await admin
      .from('com_caixas')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('pedido_id', pedidoId)
    const caixaIds = (caixas || []).map((caixa) => caixa.id)
    if (caixaIds.length) {
      await admin.from('com_caixa_itens').delete().eq('empresa_id', empresaId).in('caixa_id', caixaIds)
    }
    await admin.from('com_caixas').delete().eq('empresa_id', empresaId).eq('pedido_id', pedidoId)
    const { data: recs } = await admin
      .from('com_recebimentos')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('pedido_id', pedidoId)
    const recIds = (recs || []).map((rec) => rec.id)
    if (recIds.length) {
      await admin.from('com_recebimento_itens').delete().eq('empresa_id', empresaId).in('recebimento_id', recIds)
    }
    await admin.from('com_recebimentos').delete().eq('empresa_id', empresaId).eq('pedido_id', pedidoId)
    const { data: devs } = await admin
      .from('com_devolucoes')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('pedido_id', pedidoId)
    const devIds = (devs || []).map((dev) => dev.id)
    if (devIds.length) {
      await admin.from('com_devolucao_itens').delete().eq('empresa_id', empresaId).in('devolucao_id', devIds)
    }
    await admin.from('com_devolucoes').delete().eq('empresa_id', empresaId).eq('pedido_id', pedidoId)
    const { data: notas } = await admin
      .from('com_notas')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('pedido_id', pedidoId)
    const notaIds = (notas || []).map((nota) => nota.id)
    if (notaIds.length) {
      await admin.from('com_pre_titulos').delete().eq('empresa_id', empresaId).in('nota_id', notaIds)
      await admin.from('com_nota_itens').delete().eq('empresa_id', empresaId).in('nota_id', notaIds)
      await admin.from('com_sku_custo_ultima').delete().eq('empresa_id', empresaId).in('nota_id', notaIds)
    }
    await admin.from('com_notas').delete().eq('empresa_id', empresaId).eq('pedido_id', pedidoId)
    await admin.from('com_pedido_aprovacoes').delete().eq('empresa_id', empresaId).eq('pedido_id', pedidoId)
    await admin.from('com_pedido_itens').delete().eq('empresa_id', empresaId).eq('pedido_id', pedidoId)
    await admin.from('com_pedidos').delete().eq('id', pedidoId).eq('empresa_id', empresaId)
  }
  if (bag.cotacaoId) {
    await admin.from('com_cotacao_propostas').delete().eq('empresa_id', empresaId).eq('cotacao_id', bag.cotacaoId)
    await admin.from('com_cotacao_fornecedores').delete().eq('empresa_id', empresaId).eq('cotacao_id', bag.cotacaoId)
    await admin.from('com_cotacao_itens').delete().eq('empresa_id', empresaId).eq('cotacao_id', bag.cotacaoId)
    await admin.from('com_cotacoes').delete().eq('id', bag.cotacaoId).eq('empresa_id', empresaId)
  }
  if (bag.solicitacaoId) {
    await admin.from('com_solicitacao_itens').delete().eq('empresa_id', empresaId).eq('solicitacao_id', bag.solicitacaoId)
    await admin.from('com_solicitacoes').delete().eq('id', bag.solicitacaoId).eq('empresa_id', empresaId)
  }
  for (const skuId of bag.skuIds || []) {
    await admin.from('com_sku_custo_ultima').delete().eq('empresa_id', empresaId).eq('sku_id', skuId)
    await admin.from('est_saldos').delete().eq('empresa_id', empresaId).eq('sku_id', skuId)
    await admin.from('est_movimentos').delete().eq('empresa_id', empresaId).eq('sku_id', skuId)
    await admin.from('est_series').delete().eq('empresa_id', empresaId).eq('sku_id', skuId)
    const { error } = await admin.from('cad_skus').delete().eq('id', skuId).eq('empresa_id', empresaId)
    assertOk(error, 'apagar SKU de teste')
  }
  for (const pessoaId of bag.pessoaIds || []) {
    await admin.from('crm_leads').delete().eq('id', pessoaId).eq('empresa_id', empresaId)
  }
}

async function comFlags(admin, empresaId, patch, fn) {
  const { data: antes, error: lerErr } = await admin
    .from('com_config')
    .select('recebimento_por_caixa, recebimento_importados, local_entrada_id')
    .eq('empresa_id', empresaId)
    .maybeSingle()
  assertOk(lerErr, 'ler com_config')
  if (!antes) {
    const { error } = await admin.from('com_config').insert({ empresa_id: empresaId, ...patch })
    assertOk(error, 'criar com_config')
  } else {
    const { error } = await admin.from('com_config').update(patch).eq('empresa_id', empresaId)
    assertOk(error, 'atualizar com_config')
  }
  try {
    await fn()
  } finally {
    if (!antes) {
      await admin.from('com_config').delete().eq('empresa_id', empresaId)
    } else {
      await admin
        .from('com_config')
        .update({
          recebimento_por_caixa: antes.recebimento_por_caixa,
          recebimento_importados: antes.recebimento_importados,
          local_entrada_id: antes.local_entrada_id,
        })
        .eq('empresa_id', empresaId)
    }
  }
}

async function relatorio(client, empresaId, slug, filtros = {}) {
  const { data, error } = await client.rpc('com_rpc_relatorio', {
    p_empresa_id: empresaId,
    p_slug: slug,
    p_filtros: filtros,
  })
  if (error) throw new Error(`${slug}: ${error.message}`)
  if (!data || data.error) throw new Error(`${slug}: ${data?.error || 'sem retorno'}`)
  if (!Array.isArray(data.rows)) throw new Error(`${slug}: rows não é lista`)
  if (data.resumo?.total_count == null) throw new Error(`${slug}: sem total_count`)
  const limite = Number(filtros.limit || 50)
  if (data.rows.length > limite) throw new Error(`${slug}: página ${data.rows.length} maior que ${limite}`)
  return data
}

async function runCase(id, fn) {
  const started = Date.now()
  try {
    await fn()
    record(id, 'passed', undefined, Date.now() - started)
  } catch (error) {
    record(id, 'failed', error instanceof Error ? error.message : String(error), Date.now() - started)
  }
}

async function scrF1(client, admin, me) {
  const bag = { pessoaIds: [], skuIds: [] }
  try {
    const numero = await proximoNumero(admin, me.empresa_id, 'com_solicitacoes', 'SOL')
    const sku = await criarSku(client, me)
    bag.skuIds.push(sku.id)
    const { data: sol, error } = await client
      .from('com_solicitacoes')
      .insert({
        empresa_id: me.empresa_id,
        numero,
        tipo: 'produtivo',
        status: 'registrada',
        observacao: marker,
        solicitante_usuario_id: me.id,
      })
      .select('id, numero, empresa_id')
      .single()
    assertOk(error, 'criar solicitação')
    bag.solicitacaoId = sol.id
    if (!sol.numero.startsWith(`SOL-${hojeSp().replaceAll('-', '')}-`)) {
      throw new Error(`número fora do dia: ${sol.numero}`)
    }
    if (sol.empresa_id !== me.empresa_id) throw new Error('solicitação em outra empresa')
    const { error: itemErr } = await client.from('com_solicitacao_itens').insert({
      empresa_id: me.empresa_id,
      solicitacao_id: sol.id,
      sku_id: sku.id,
      descricao: sku.codigo,
      quantidade: 2,
      unidade: 'UN',
    })
    assertOk(itemErr, 'item da solicitação')
    const { error: tipoErr } = await client.from('com_solicitacoes').insert({
      empresa_id: me.empresa_id,
      numero: `${numero}-X`,
      tipo: 'aluguel',
      observacao: marker,
    })
    if (!tipoErr) throw new Error('tipo inválido foi aceito')
    const { error: outra } = await client.from('com_solicitacoes').insert({
      empresa_id: '00000000-0000-0000-0000-000000000000',
      numero: `${numero}-Y`,
      tipo: 'produtivo',
      observacao: marker,
    })
    if (!outra) throw new Error('solicitação aceitou outra empresa')
  } finally {
    await limpar(admin, me.empresa_id, bag)
  }
}

async function scrF2(client, admin, me) {
  const bag = { pessoaIds: [], skuIds: [], pedidoIds: [] }
  try {
    const sku = await criarSku(client, me)
    bag.skuIds.push(sku.id)
    const pessoa = await criarFornecedor(client, me, 'Fornecedor')
    bag.pessoaIds.push(pessoa.id)
    const numero = await proximoNumero(admin, me.empresa_id, 'com_cotacoes', 'COT')
    const { data: cot, error } = await client
      .from('com_cotacoes')
      .insert({
        empresa_id: me.empresa_id,
        numero,
        tipo: 'produtivo',
        status: 'em_cotacao',
        observacao: marker,
        criador_usuario_id: me.id,
      })
      .select('id')
      .single()
    assertOk(error, 'criar cotação')
    bag.cotacaoId = cot.id
    const { data: item, error: itemErr } = await client
      .from('com_cotacao_itens')
      .insert({
        empresa_id: me.empresa_id,
        cotacao_id: cot.id,
        sku_id: sku.id,
        descricao: sku.codigo,
        quantidade: 3,
        unidade: 'UN',
      })
      .select('id')
      .single()
    assertOk(itemErr, 'item da cotação')
    const { error: fornErr } = await client.from('com_cotacao_fornecedores').insert({
      empresa_id: me.empresa_id,
      cotacao_id: cot.id,
      fornecedor_id: pessoa.id,
      ordem: 1,
      condicao_texto: 'a vista',
    })
    assertOk(fornErr, 'fornecedor da cotação')
    const extra = await criarFornecedor(client, me, 'Quarto')
    bag.pessoaIds.push(extra.id)
    const { error: quarto } = await client.from('com_cotacao_fornecedores').insert({
      empresa_id: me.empresa_id,
      cotacao_id: cot.id,
      fornecedor_id: extra.id,
      ordem: 4,
    })
    if (!quarto) throw new Error('cotação aceitou o quarto fornecedor')
    const { error: propErr } = await client.from('com_cotacao_propostas').insert({
      empresa_id: me.empresa_id,
      cotacao_id: cot.id,
      cotacao_item_id: item.id,
      fornecedor_id: pessoa.id,
      preco_unitario: 15,
    })
    assertOk(propErr, 'proposta')
    const { error: vencedorErr } = await client
      .from('com_cotacao_itens')
      .update({ vencedor_fornecedor_id: pessoa.id })
      .eq('id', item.id)
      .eq('empresa_id', me.empresa_id)
    assertOk(vencedorErr, 'eleger vencedor')
    const criado = await criarPedido(client, admin, me, pessoa, sku, {
      quantidade: 3,
      preco: 15,
      status: 'aguardando_aprovacao',
      origem: 'cotacao',
      cotacaoId: cot.id,
    })
    bag.pedidoIds.push(criado.pedido.id)
    const { error: aprErr } = await client.from('com_pedido_aprovacoes').insert({
      empresa_id: me.empresa_id,
      pedido_id: criado.pedido.id,
      nivel: 1,
      usuario_id: me.id,
      decisao: 'aprovado',
      motivo: marker,
    })
    assertOk(aprErr, 'registrar aprovação')
    const { error: statusErr } = await client
      .from('com_pedidos')
      .update({ status: 'aprovado' })
      .eq('id', criado.pedido.id)
      .eq('empresa_id', me.empresa_id)
    assertOk(statusErr, 'aprovar pedido')
    const { data: aprovacao, error: lerApr } = await client
      .from('com_pedido_aprovacoes')
      .select('usuario_id, decisao')
      .eq('empresa_id', me.empresa_id)
      .eq('pedido_id', criado.pedido.id)
      .single()
    assertOk(lerApr, 'ler aprovação')
    if (aprovacao.usuario_id !== me.id || aprovacao.decisao !== 'aprovado') {
      throw new Error('a aprovação não guardou quem decidiu')
    }
  } finally {
    await limpar(admin, me.empresa_id, bag)
  }
}

async function scrF3(client, admin, me) {
  const bag = { pessoaIds: [], skuIds: [], pedidoIds: [] }
  try {
    const sku = await criarSku(client, me)
    bag.skuIds.push(sku.id)
    const pessoa = await criarFornecedor(client, me, 'Fornecedor')
    bag.pessoaIds.push(pessoa.id)
    const criado = await criarPedido(client, admin, me, pessoa, sku, { quantidade: 10, preco: 5 })
    bag.pedidoIds.push(criado.pedido.id)
    const recebida = 7
    const pedida = Number(criado.item.quantidade)
    if (recebida - pedida > 0.0001) throw new Error('quantidade recebida maior que o saldo do item')
    const falta = divergenciaQuantidade(recebida, pedida)
    const { data: rec, error: recErr } = await client
      .from('com_recebimentos')
      .insert({
        empresa_id: me.empresa_id,
        pedido_id: criado.pedido.id,
        usuario_id: me.id,
        observacao: marker,
      })
      .select('id')
      .single()
    assertOk(recErr, 'criar recebimento')
    const { error: itemErr } = await client.from('com_recebimento_itens').insert({
      empresa_id: me.empresa_id,
      recebimento_id: rec.id,
      pedido_item_id: criado.item.id,
      quantidade: recebida,
      preco_nota: 5,
      divergencia_quantidade: falta,
      divergencia_preco: 0,
    })
    assertOk(itemErr, 'item recebido')
    const { error: statusErr } = await client
      .from('com_pedidos')
      .update({ status: 'recebido_parcial' })
      .eq('id', criado.pedido.id)
      .eq('empresa_id', me.empresa_id)
    assertOk(statusErr, 'status parcial')
    const { data: linha, error: lerErr } = await client
      .from('com_recebimento_itens')
      .select('divergencia_quantidade, empresa_id')
      .eq('recebimento_id', rec.id)
      .eq('empresa_id', me.empresa_id)
      .single()
    assertOk(lerErr, 'ler divergência')
    if (Number(linha.divergencia_quantidade) !== -3) {
      throw new Error(`falta esperada -3, veio ${linha.divergencia_quantidade}`)
    }
    const { data: pedido } = await client
      .from('com_pedidos')
      .select('status')
      .eq('id', criado.pedido.id)
      .eq('empresa_id', me.empresa_id)
      .single()
    if (pedido.status !== 'recebido_parcial') throw new Error(`status ${pedido.status}`)
  } finally {
    await limpar(admin, me.empresa_id, bag)
  }
}

async function scrF4(client, admin, me) {
  const bag = { pessoaIds: [], skuIds: [], pedidoIds: [] }
  await comFlags(admin, me.empresa_id, { recebimento_por_caixa: true, recebimento_importados: true }, async () => {
    try {
      if (normalizarCodigoEtiqueta('1625 - 0055 - 40') !== '1625005540') {
        throw new Error('a etiqueta 1625 - 0055 - 40 não normalizou')
      }
      const sku = await criarSku(client, me)
      bag.skuIds.push(sku.id)
      const pessoa = await criarFornecedor(client, me, 'Importado')
      bag.pessoaIds.push(pessoa.id)
      const codigoFornecedor = `9${Date.now().toString().slice(-9)}`
      const criado = await criarPedido(client, admin, me, pessoa, sku, {
        quantidade: 4,
        preco: 8,
        codigoFornecedor,
      })
      bag.pedidoIds.push(criado.pedido.id)
      const { data: caixa, error: caixaErr } = await client.rpc('com_abrir_caixa', {
        p_pedido: criado.pedido.id,
      })
      assertOk(caixaErr, 'abrir caixa')
      const aberta = Array.isArray(caixa) ? caixa[0] : caixa
      if (!aberta?.codigo || !/^CX-\d{6}$/.test(aberta.codigo)) {
        throw new Error(`código de caixa inválido: ${aberta?.codigo}`)
      }
      if (aberta.codigo === codigoFornecedor) throw new Error('a caixa usou o código do fornecedor')
      const { data: rec, error: recErr } = await client
        .from('com_recebimentos')
        .insert({
          empresa_id: me.empresa_id,
          pedido_id: criado.pedido.id,
          usuario_id: me.id,
          observacao: marker,
        })
        .select('id')
        .single()
      assertOk(recErr, 'recebimento comum')
      const { error: leiErr } = await client.from('com_importado_leituras').insert({
        empresa_id: me.empresa_id,
        pedido_id: criado.pedido.id,
        pedido_item_id: criado.item.id,
        recebimento_id: rec.id,
        codigo_lido: codigoFornecedor,
        codigo_normalizado: normalizarCodigoEtiqueta(codigoFornecedor),
        quantidade: 1,
        local_temporario: 'Doca teste',
        limpeza: 'baixa_manual',
        usuario_id: me.id,
      })
      assertOk(leiErr, 'leitura de importado')
      const { count, error: comumErr } = await client
        .from('com_recebimentos')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', me.empresa_id)
        .eq('pedido_id', criado.pedido.id)
      assertOk(comumErr, 'contar recebimento comum')
      if (!count) throw new Error('o recebimento comum sumiu com a caixa ligada')
    } finally {
      await limpar(admin, me.empresa_id, bag)
    }
  })
}

function custoUnitario(quantidade, preco, frete) {
  const valorItem = quantidade * preco
  const rateado = valorItem > 0 ? (frete * valorItem) / valorItem : 0
  return quantidade > 0 ? (valorItem + rateado) / quantidade : 0
}

async function scrF5(client, admin, me) {
  const bag = { pessoaIds: [], skuIds: [], pedidoIds: [] }
  const localId = await localPrincipal(client, me.empresa_id)
  await comFlags(admin, me.empresa_id, { local_entrada_id: localId }, async () => {
    try {
      const sku = await criarSku(client, me)
      bag.skuIds.push(sku.id)
      const pessoa = await criarFornecedor(client, me, 'Nota')
      bag.pessoaIds.push(pessoa.id)
      const produtivo = await criarPedido(client, admin, me, pessoa, sku, { quantidade: 2, preco: 10 })
      bag.pedidoIds.push(produtivo.pedido.id)
      const precoNota = 12
      const frete = 4
      const quantidade = 2
      const aviso = precoNota !== Number(produtivo.item.preco_unitario)
      if (!aviso) throw new Error('o caso precisa de preço diferente')
      const { data: nota, error: notaErr } = await client
        .from('com_notas')
        .insert({
          empresa_id: me.empresa_id,
          pedido_id: produtivo.pedido.id,
          fornecedor_id: pessoa.id,
          numero: `NF-${sku.codigo}`,
          serie: '1',
          data_emissao: hojeSp(),
          valor_total: quantidade * precoNota + frete,
          status: 'confirmada',
          origem: 'manual',
          frete,
          observacao: marker,
          criador_usuario_id: me.id,
        })
        .select('id')
        .single()
      assertOk(notaErr, 'criar nota')
      const { error: linhaErr } = await client.from('com_nota_itens').insert({
        empresa_id: me.empresa_id,
        nota_id: nota.id,
        pedido_item_id: produtivo.item.id,
        sku_id: sku.id,
        descricao: sku.codigo,
        quantidade,
        preco_unitario: precoNota,
        preco_pedido: Number(produtivo.item.preco_unitario),
        aviso_preco: true,
        frete_rateado: 0,
      })
      assertOk(linhaErr, 'item da nota')
      const { data: rateado, error: rateioErr } = await client
        .from('com_nota_itens')
        .update({ frete_rateado: frete })
        .eq('empresa_id', me.empresa_id)
        .eq('nota_id', nota.id)
        .select('frete_rateado')
        .single()
      assertOk(rateioErr, 'gravar frete rateado')
      if (Number(rateado.frete_rateado) !== frete) {
        throw new Error(`frete rateado esperado ${frete}, veio ${rateado.frete_rateado}`)
      }
      const custo = custoUnitario(quantidade, precoNota, frete)
      if (custo !== 14) throw new Error(`custo esperado 14, veio ${custo}`)
      const { error: custoErr } = await client.from('com_sku_custo_ultima').upsert(
        {
          empresa_id: me.empresa_id,
          sku_id: sku.id,
          nota_id: nota.id,
          valor: custo,
          atualizado_em: new Date().toISOString(),
        },
        { onConflict: 'empresa_id,sku_id' },
      )
      assertOk(custoErr, 'custo da última compra')
      const { data: gravado, error: lerCusto } = await client
        .from('com_sku_custo_ultima')
        .select('valor')
        .eq('empresa_id', me.empresa_id)
        .eq('sku_id', sku.id)
        .single()
      assertOk(lerCusto, 'ler custo')
      if (Number(gravado.valor) !== 14) throw new Error(`custo gravado ${gravado.valor}`)

      const servicoSku = await criarSku(client, me)
      bag.skuIds.push(servicoSku.id)
      const servico = await criarPedido(client, admin, me, pessoa, servicoSku, {
        quantidade: 1,
        preco: 30,
        tipo: 'servico',
      })
      bag.pedidoIds.push(servico.pedido.id)
      const { data: notaServico, error: servicoNotaErr } = await client
        .from('com_notas')
        .insert({
          empresa_id: me.empresa_id,
          pedido_id: servico.pedido.id,
          fornecedor_id: pessoa.id,
          numero: `NF-${servicoSku.codigo}`,
          serie: '1',
          data_emissao: hojeSp(),
          valor_total: 30,
          status: 'confirmada',
          origem: 'manual',
          observacao: marker,
          criador_usuario_id: me.id,
        })
        .select('id, numero, serie')
        .single()
      assertOk(servicoNotaErr, 'nota de serviço')
      const documento = `${notaServico.numero}/${notaServico.serie}`
      const { count, error: movErr } = await admin
        .from('est_movimentos')
        .select('*', { count: 'exact', head: true })
        .eq('empresa_id', me.empresa_id)
        .eq('documento', documento)
      assertOk(movErr, 'cardex do serviço')
      if (count) throw new Error('nota de serviço gerou movimento de estoque')
      const { data: custoServico } = await admin
        .from('com_sku_custo_ultima')
        .select('sku_id')
        .eq('empresa_id', me.empresa_id)
        .eq('sku_id', servicoSku.id)
        .maybeSingle()
      if (custoServico) throw new Error('serviço gravou custo de compra')
    } finally {
      await limpar(admin, me.empresa_id, bag)
    }
  })
}

async function scrF6(client, admin, me) {
  const bag = { pessoaIds: [], skuIds: [], pedidoIds: [] }
  try {
    const sku = await criarSku(client, me)
    bag.skuIds.push(sku.id)
    const pessoa = await criarFornecedor(client, me, 'Devolução')
    bag.pessoaIds.push(pessoa.id)
    const criado = await criarPedido(client, admin, me, pessoa, sku, { quantidade: 2, preco: 9 })
    bag.pedidoIds.push(criado.pedido.id)
    const { data: extra, error: extraErr } = await client
      .from('com_pedido_itens')
      .insert({
        empresa_id: me.empresa_id,
        pedido_id: criado.pedido.id,
        sku_id: sku.id,
        descricao: `${sku.codigo} avaria`,
        quantidade: 1,
        unidade: 'UN',
        preco_unitario: 9,
      })
      .select('id')
      .single()
    assertOk(extraErr, 'segundo item')
    const numero = await proximoNumero(admin, me.empresa_id, 'com_devolucoes', 'DEV')
    const { data: dev, error: devErr } = await client
      .from('com_devolucoes')
      .insert({
        empresa_id: me.empresa_id,
        pedido_id: criado.pedido.id,
        fornecedor_id: pessoa.id,
        numero,
        status: 'confirmada',
        observacao: marker,
        criador_usuario_id: me.id,
      })
      .select('id, numero')
      .single()
    assertOk(devErr, 'criar devolução')
    if (!dev.numero.startsWith('DEV-')) throw new Error(`número ${dev.numero}`)
    const { error: motivoErr } = await client.from('com_devolucao_itens').insert({
      empresa_id: me.empresa_id,
      devolucao_id: dev.id,
      pedido_item_id: criado.item.id,
      sku_id: sku.id,
      descricao: sku.codigo,
      quantidade: 1,
      motivo: 'garantia',
    })
    if (!motivoErr) throw new Error('motivo fora da lista foi aceito')
    const { error: itensErr } = await client.from('com_devolucao_itens').insert([
      {
        empresa_id: me.empresa_id,
        devolucao_id: dev.id,
        pedido_item_id: criado.item.id,
        sku_id: sku.id,
        descricao: sku.codigo,
        quantidade: 1,
        motivo: 'outro',
      },
      {
        empresa_id: me.empresa_id,
        devolucao_id: dev.id,
        pedido_item_id: extra.id,
        sku_id: sku.id,
        descricao: `${sku.codigo} avaria`,
        quantidade: 1,
        motivo: 'avaria',
      },
    ])
    assertOk(itensErr, 'itens da devolução')
    const { count, error: movErr } = await admin
      .from('est_movimentos')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', me.empresa_id)
      .eq('sku_id', sku.id)
    assertOk(movErr, 'cardex da devolução')
    if (count) throw new Error('devolução moveu estoque')
  } finally {
    await limpar(admin, me.empresa_id, bag)
  }
}

async function scrF7(client, admin, me) {
  const bag = { pessoaIds: [], skuIds: [], pedidoIds: [] }
  try {
    const sku = await criarSku(client, me)
    bag.skuIds.push(sku.id)
    const pessoa = await criarFornecedor(client, me, 'Título')
    bag.pessoaIds.push(pessoa.id)
    const criado = await criarPedido(client, admin, me, pessoa, sku, { quantidade: 1, preco: 40 })
    bag.pedidoIds.push(criado.pedido.id)
    const { data: nota, error: notaErr } = await client
      .from('com_notas')
      .insert({
        empresa_id: me.empresa_id,
        pedido_id: criado.pedido.id,
        fornecedor_id: pessoa.id,
        numero: `NF-${sku.codigo}`,
        serie: '1',
        data_emissao: hojeSp(),
        valor_total: 40,
        status: 'confirmada',
        origem: 'manual',
        observacao: marker,
        criador_usuario_id: me.id,
      })
      .select('id')
      .single()
    assertOk(notaErr, 'nota do pré-título')
    const { data: primeiro, error: rpcErr } = await client.rpc('com_gravar_pre_titulo', {
      p_nota_id: nota.id,
    })
    assertOk(rpcErr, 'gravar pré-título')
    const { data: segundo, error: rpc2 } = await client.rpc('com_gravar_pre_titulo', {
      p_nota_id: nota.id,
    })
    assertOk(rpc2, 'gravar pré-título de novo')
    if (!primeiro || primeiro !== segundo) throw new Error('a segunda chamada criou outro pré-título')
    const { data: titulo, error: lerErr } = await client
      .from('com_pre_titulos')
      .select('numero, status, valor')
      .eq('id', primeiro)
      .eq('empresa_id', me.empresa_id)
      .single()
    assertOk(lerErr, 'ler pré-título')
    if (!String(titulo.numero).startsWith(`PT-${hojeSp().replaceAll('-', '')}-`)) {
      throw new Error(`número ${titulo.numero}`)
    }
    if (titulo.status !== 'aguardando_ap') throw new Error(`status ${titulo.status}`)
    if (Number(titulo.valor) !== 40) throw new Error(`valor ${titulo.valor}`)
  } finally {
    await limpar(admin, me.empresa_id, bag)
  }
}

async function entrarSerie(client, me, skuId, localId, numero, documento) {
  const { data, error } = await client.rpc('est_registrar_movimento_atomico', {
    p_empresa_id: me.empresa_id,
    p_tipo: 'entrada',
    p_sku_id: skuId,
    p_local_id: localId,
    p_quantidade: 1,
    p_documento: documento,
    p_origem: 'lote_tela',
    p_motivo: `${marker} série ${numero}`,
    p_usuario_id: me.id,
    p_numero_serie: numero,
  })
  const parsed = parseRpc(data, error)
  if (!parsed.ok) throw new Error(parsed.message || `entrada da série ${numero} falhou`)
}

async function scrF8(client, admin, me) {
  const bag = { pessoaIds: [], skuIds: [], pedidoIds: [] }
  const localId = await localPrincipal(client, me.empresa_id)
  try {
    const sku = await criarSku(client, me, { controla_serie: true })
    bag.skuIds.push(sku.id)
    const pessoa = await criarFornecedor(client, me, 'Série')
    bag.pessoaIds.push(pessoa.id)
    const criado = await criarPedido(client, admin, me, pessoa, sku, { quantidade: 2, preco: 7 })
    bag.pedidoIds.push(criado.pedido.id)
    const { data: nota, error: notaErr } = await client
      .from('com_notas')
      .insert({
        empresa_id: me.empresa_id,
        pedido_id: criado.pedido.id,
        fornecedor_id: pessoa.id,
        numero: `NF-${sku.codigo}`,
        serie: '1',
        data_emissao: hojeSp(),
        valor_total: 14,
        status: 'confirmada',
        origem: 'manual',
        observacao: marker,
        criador_usuario_id: me.id,
      })
      .select('id, numero, serie')
      .single()
    assertOk(notaErr, 'nota com série')
    const serialA = `SN-${sku.codigo}-A`
    const serialB = `SN-${sku.codigo}-B`
    if (seriesConferem(serialA, 2)) throw new Error('uma série foi aceita para duas unidades')
    if (seriesConferem(`${serialA}, ${serialA.toLowerCase()}`, 2)) {
      throw new Error('série repetida foi aceita')
    }
    const { count: antes } = await admin
      .from('est_series')
      .select('*', { count: 'exact', head: true })
      .eq('empresa_id', me.empresa_id)
      .eq('sku_id', sku.id)
    if (antes) throw new Error('a conferência incompleta já criou série')
    const { data: linha, error: linhaErr } = await client
      .from('com_nota_itens')
      .insert({
        empresa_id: me.empresa_id,
        nota_id: nota.id,
        pedido_item_id: criado.item.id,
        sku_id: sku.id,
        descricao: sku.codigo,
        quantidade: 2,
        preco_unitario: 7,
        n_serie: serialA,
      })
      .select('id, n_serie, quantidade')
      .single()
    assertOk(linhaErr, 'linha com uma série')
    if (seriesConferem(linha.n_serie, Number(linha.quantidade))) {
      throw new Error('uma série foi gravada como suficiente para duas unidades')
    }
    const { data: completa, error: completaErr } = await client
      .from('com_nota_itens')
      .update({ n_serie: `${serialA}, ${serialB}` })
      .eq('id', linha.id)
      .eq('empresa_id', me.empresa_id)
      .select('n_serie, quantidade')
      .single()
    assertOk(completaErr, 'completar séries da nota')
    if (!seriesConferem(completa.n_serie, Number(completa.quantidade))) {
      throw new Error(`duas séries não conferiram: ${completa.n_serie} x ${completa.quantidade}`)
    }
    const documento = `${nota.numero}/${nota.serie}`
    for (const numero of listarNumerosSerie(completa.n_serie)) {
      await entrarSerie(client, me, sku.id, localId, numero, documento)
    }
    const { data: series, error: serieErr } = await client
      .from('est_series')
      .select('numero, situacao')
      .eq('empresa_id', me.empresa_id)
      .eq('sku_id', sku.id)
    assertOk(serieErr, 'ler séries')
    if ((series || []).length !== 2 || (series || []).some((serie) => serie.situacao !== 'em_estoque')) {
      throw new Error('as duas séries não ficaram em estoque')
    }
    const { error: saldoErr } = await admin.from('est_saldos').insert({
      empresa_id: me.empresa_id,
      sku_id: sku.id,
      local_id: localId,
      quantidade: 1,
    })
    assertOk(saldoErr, 'saldo antigo sem série')
    const saida = await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: me.empresa_id,
      p_tipo: 'saida',
      p_sku_id: sku.id,
      p_local_id: localId,
      p_quantidade: 1,
      p_documento: `${documento}-OUT`,
      p_usuario_id: me.id,
    })
    const bloqueio = parseRpc(saida.data, saida.error)
    if (bloqueio.ok) throw new Error('saldo sem série saiu')
  } finally {
    await limpar(admin, me.empresa_id, bag)
  }
}

async function scrF9(client, admin, me) {
  const bag = { pessoaIds: [], skuIds: [], pedidoIds: [] }
  const localId = await localPrincipal(client, me.empresa_id)
  try {
    const hoje = hojeSp()
    const antesTipo = await relatorio(client, me.empresa_id, 'compras-por-tipo', {
      data_inicio: hoje,
      data_fim: hoje,
      tipo: 'produtivo',
      limit: 200,
    })
    const antesChegar = await relatorio(client, me.empresa_id, 'a-chegar', { limit: 200 })
    const antesQuem = await relatorio(client, me.empresa_id, 'quem-liberou', {
      data_inicio: hoje,
      data_fim: hoje,
      limit: 200,
    })
    const antesTitulo = await relatorio(client, me.empresa_id, 'pre-titulos-parados', { limit: 200 })

    const sku = await criarSku(client, me, { controla_serie: true })
    bag.skuIds.push(sku.id)
    const pessoa = await criarFornecedor(client, me, 'Relatório')
    bag.pessoaIds.push(pessoa.id)
    const criado = await criarPedido(client, admin, me, pessoa, sku, { quantidade: 10, preco: 10 })
    bag.pedidoIds.push(criado.pedido.id)
    const { error: aprErr } = await client.from('com_pedido_aprovacoes').insert({
      empresa_id: me.empresa_id,
      pedido_id: criado.pedido.id,
      nivel: 1,
      usuario_id: me.id,
      decisao: 'aprovado',
      motivo: marker,
    })
    assertOk(aprErr, 'aprovação do relatório')
    const { data: rec, error: recErr } = await client
      .from('com_recebimentos')
      .insert({
        empresa_id: me.empresa_id,
        pedido_id: criado.pedido.id,
        usuario_id: me.id,
        observacao: marker,
      })
      .select('id')
      .single()
    assertOk(recErr, 'recebimento do relatório')
    const { error: divErr } = await client.from('com_recebimento_itens').insert({
      empresa_id: me.empresa_id,
      recebimento_id: rec.id,
      pedido_item_id: criado.item.id,
      quantidade: 7,
      divergencia_quantidade: -3,
    })
    assertOk(divErr, 'divergência do relatório')
    const { data: nota, error: notaErr } = await client
      .from('com_notas')
      .insert({
        empresa_id: me.empresa_id,
        pedido_id: criado.pedido.id,
        fornecedor_id: pessoa.id,
        numero: `NF-${sku.codigo}`,
        serie: '1',
        data_emissao: hoje,
        valor_total: 120,
        status: 'confirmada',
        origem: 'manual',
        observacao: marker,
        criador_usuario_id: me.id,
      })
      .select('id')
      .single()
    assertOk(notaErr, 'nota do relatório')
    const { error: linhaErr } = await client.from('com_nota_itens').insert({
      empresa_id: me.empresa_id,
      nota_id: nota.id,
      pedido_item_id: criado.item.id,
      sku_id: sku.id,
      descricao: sku.codigo,
      quantidade: 10,
      preco_unitario: 12,
      preco_pedido: 10,
      aviso_preco: true,
    })
    assertOk(linhaErr, 'preço divergente')
    const { error: custoErr } = await client.from('com_sku_custo_ultima').upsert(
      {
        empresa_id: me.empresa_id,
        sku_id: sku.id,
        nota_id: nota.id,
        valor: 12,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: 'empresa_id,sku_id' },
    )
    assertOk(custoErr, 'custo do relatório')
    const { error: tituloErr } = await client.rpc('com_gravar_pre_titulo', { p_nota_id: nota.id })
    assertOk(tituloErr, 'pré-título do relatório')
    const numeroDev = await proximoNumero(admin, me.empresa_id, 'com_devolucoes', 'DEV')
    const { data: dev, error: devErr } = await client
      .from('com_devolucoes')
      .insert({
        empresa_id: me.empresa_id,
        pedido_id: criado.pedido.id,
        fornecedor_id: pessoa.id,
        numero: numeroDev,
        status: 'confirmada',
        observacao: marker,
        criador_usuario_id: me.id,
      })
      .select('id')
      .single()
    assertOk(devErr, 'devolução do relatório')
    const { error: devItemErr } = await client.from('com_devolucao_itens').insert({
      empresa_id: me.empresa_id,
      devolucao_id: dev.id,
      pedido_item_id: criado.item.id,
      sku_id: sku.id,
      descricao: sku.codigo,
      quantidade: 1,
      motivo: 'trocado',
    })
    assertOk(devItemErr, 'item devolvido')
    const serial = `SN-${sku.codigo}`
    await entrarSerie(client, me, sku.id, localId, serial, `NF-${sku.codigo}/1`)

    for (const slug of SLUGS) {
      await relatorio(client, me.empresa_id, slug, { limit: 50 })
    }
    const pagina = await relatorio(client, me.empresa_id, 'compras-por-tipo', { limit: 1 })
    if (pagina.rows.length > 1) throw new Error('o limite 1 não segurou a página')

    const tipo = await relatorio(client, me.empresa_id, 'compras-por-tipo', {
      data_inicio: hoje,
      data_fim: hoje,
      tipo: 'produtivo',
      limit: 200,
    })
    if (Number(tipo.resumo.total_count) !== Number(antesTipo.resumo.total_count) + 1) {
      throw new Error('compras por tipo não viu o pedido do dia')
    }
    const chegar = await relatorio(client, me.empresa_id, 'a-chegar', { limit: 200 })
    if (Number(chegar.resumo.total_count) !== Number(antesChegar.resumo.total_count) + 1) {
      throw new Error('a chegar não contou o pedido aprovado')
    }
    const quem = await relatorio(client, me.empresa_id, 'quem-liberou', {
      data_inicio: hoje,
      data_fim: hoje,
      limit: 200,
    })
    if (Number(quem.resumo.total_count) !== Number(antesQuem.resumo.total_count) + 1) {
      throw new Error('quem liberou não viu a aprovação')
    }
    const divergencias = await relatorio(client, me.empresa_id, 'divergencias', {
      sku_codigo: sku.codigo,
      limit: 50,
    })
    if (Number(divergencias.resumo.faltas) < 1) throw new Error('divergência não contou a falta')
    const preco = await relatorio(client, me.empresa_id, 'preco-divergente', {
      sku_codigo: sku.codigo,
      limit: 50,
    })
    if (Number(preco.resumo.total_count) < 1) throw new Error('preço divergente não achou a nota')
    const devolucoes = await relatorio(client, me.empresa_id, 'devolucoes', {
      data_inicio: hoje,
      data_fim: hoje,
      status: 'confirmada',
      limit: 200,
    })
    if (!(devolucoes.rows || []).some((row) => row.numero === numeroDev)) {
      throw new Error('devoluções não listou o documento do teste')
    }
    const custo = await relatorio(client, me.empresa_id, 'custo-ultima-compra', {
      sku_codigo: sku.codigo,
      limit: 50,
    })
    if (Number(custo.rows[0]?.valor) !== 12) throw new Error('custo da última compra divergente')
    const titulos = await relatorio(client, me.empresa_id, 'pre-titulos-parados', { limit: 200 })
    if (Number(titulos.resumo.total_count) !== Number(antesTitulo.resumo.total_count) + 1) {
      throw new Error('pré-títulos parados não contou o aguardando AP')
    }
    const serie = await relatorio(client, me.empresa_id, 'onde-esta-serie', {
      sku_codigo: sku.codigo,
      situacao: 'em_estoque',
      limit: 50,
    })
    if (!(serie.rows || []).some((row) => row.numero === serial)) {
      throw new Error('onde está a série não achou a unidade')
    }
    const baixada = await relatorio(client, me.empresa_id, 'onde-esta-serie', {
      sku_codigo: sku.codigo,
      situacao: 'baixada',
      limit: 50,
    })
    if (Number(baixada.resumo.total_count) !== 0) throw new Error('série em estoque apareceu como baixada')

    const { data: desconhecido, error: slugErr } = await client.rpc('com_rpc_relatorio', {
      p_empresa_id: me.empresa_id,
      p_slug: 'inexistente',
      p_filtros: {},
    })
    assertOk(slugErr, 'slug inexistente')
    if (desconhecido?.error !== 'Relatório não encontrado.') {
      throw new Error(`slug inválido respondeu ${desconhecido?.error}`)
    }

    const { data: outras } = await admin.from('empresas').select('id').neq('id', me.empresa_id).limit(1)
    if (outras?.[0]?.id) {
      const { error: vazamento } = await client.rpc('com_rpc_relatorio', {
        p_empresa_id: outras[0].id,
        p_slug: 'compras-por-tipo',
        p_filtros: {},
      })
      if (!vazamento || !/ACESSO_NEGADO|fora do tenant/i.test(vazamento.message)) {
        throw new Error('relatório aceitou outra empresa')
      }
    }
  } finally {
    await limpar(admin, me.empresa_id, bag)
  }
}

async function main() {
  mkdirSync(runDir, { recursive: true })
  console.log('\n[agent] Scripts Compras — fases 1 a 9')
  appendEvent({ ts: new Date().toISOString(), type: 'log', message: 'Scripts Compras' })

  try {
    assertConfig()
    const admin = createClient(URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { client, me } = await loginPrincipal()
    await ensureComprasAddon(admin, me.empresa_id)
    await runCase('SCR-COM-F1-01', () => scrF1(client, admin, me))
    await runCase('SCR-COM-F2-01', () => scrF2(client, admin, me))
    await runCase('SCR-COM-F3-01', () => scrF3(client, admin, me))
    await runCase('SCR-COM-F4-01', () => scrF4(client, admin, me))
    await runCase('SCR-COM-F5-01', () => scrF5(client, admin, me))
    await runCase('SCR-COM-F6-01', () => scrF6(client, admin, me))
    await runCase('SCR-COM-F7-01', () => scrF7(client, admin, me))
    await runCase('SCR-COM-F8-01', () => scrF8(client, admin, me))
    await runCase('SCR-COM-F9-01', () => scrF9(client, admin, me))
    await client.auth.signOut()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    for (const id of Object.keys(CATALOG)) {
      if (!cases.some((item) => item.id === id)) record(id, 'failed', message, 0)
    }
  }

  const passed = cases.filter((item) => item.status === 'passed').length
  const failed = cases.filter((item) => item.status === 'failed').length
  const skipped = cases.filter((item) => item.status === 'skipped').length
  const summary = {
    ambiente: 'DEV',
    result: failed === 0 ? 'PASS' : 'FAIL',
    summary: { passed, failed, skipped, total: cases.length },
    cases,
  }
  writeFileSync(resolve(runDir, 'compras-scripts-summary.json'), JSON.stringify(summary, null, 2), 'utf8')
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

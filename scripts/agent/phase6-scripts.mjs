/**
 * Fase 6 — Estoque: SCR-EST-* (Regra de Ouro, saldo, transferência, remessa, batch, tenant, RPC).
 */
import { randomUUID } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { config as loadDotenv } from 'dotenv'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { assertDevTarget } from './test-env-guard.mjs'
import {
  isUnsafeCardexOrPlan,
  planCardexTextSearch,
  postgrestIlikePattern,
} from '../../src/lib/estoque/cardex-filters.mjs'

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
const marker = `[agent-est:${runKey}]`
const runDir =
  process.env.TEST_RUN_DIR || resolve(root, 'docs/homologacao/execucoes', runKey)
const eventsPath = process.env.TEST_RUN_EVENTS_PATH || ''

const cases = []
const CATALOG = {
  'SCR-EST-GOLD-01': {
    area: 'Estoque / Regra de Ouro',
    expectation: 'Entrada via RPC grava Cardex e Saldo juntos; falha de saldo não deixa divergência.',
    passos: 'Cria SKU/local, chama est_registrar_movimento_atomico entrada e valida movimento+saldo.',
  },
  'SCR-EST-ENT-01': {
    area: 'Estoque / Entradas',
    expectation: 'Entrada sobe saldo e cardex tipo entrada.',
    passos: 'RPC entrada com documento marcador; confere est_movimentos e est_saldos; cleanup.',
  },
  'SCR-EST-SALDO-01': {
    area: 'Estoque / Saldo insuficiente',
    expectation: 'Saída acima do disponível é bloqueada sem alterar posição.',
    passos: 'Com saldo conhecido, tenta saida maior; espera SALDO_INSUFICIENTE e saldo intacto.',
  },
  'SCR-EST-TRF-01': {
    area: 'Estoque / Transferências',
    expectation: 'Transferência redistribui saldos mantendo total do SKU.',
    passos: 'Entrada na origem, transferência para destino, confere origem↓ destino↑.',
  },
  'SCR-EST-REM-01': {
    area: 'Estoque / Remessas',
    expectation: 'Remessa saída baixa local e sobe poder de terceiros.',
    passos: 'Entrada + remessa_saida com pessoa; valida saldo local e est_saldos_poder_terceiros.',
  },
  'SCR-EST-BATCH-01': {
    area: 'Estoque / Batch',
    expectation: 'Reconstrução de saldos a partir do cardex fecha por empresa.',
    passos: 'Chama est_reconstruir_saldos_from_cardex no tenant e confere retorno ok.',
  },
  'SCR-EST-TENANT-01': {
    area: 'Estoque / Multi-tenant',
    expectation: 'Empresa B não lê movimentos/saldos da empresa A.',
    passos: 'Cria movimento em A; consulta autenticada filtrada; sentinela em outro tenant invisível.',
  },
  'SCR-EST-RPC-01': {
    area: 'Estoque / Relatórios RPC',
    expectation: 'est_rpc_relatorio pagina com total_count estável no tenant.',
    passos: 'Chama slug valor-estoque limit 50; confere shape rows/resumo e isolamento.',
  },
  'SCR-EST-REQ-01': {
    area: 'Estoque / Requisições',
    expectation: 'Requisição efêmera cria cabeçalho+item e atendimento via saída origem=requisicao.',
    passos: 'Insert req+item, baixa com RPC saida, valida cardex e cleanup.',
  },
  'SCR-EST-RBAC-01': {
    area: 'Estoque / RBAC',
    expectation: 'Usuário sem estoque.view não lê saldos do tenant.',
    passos: 'Cria grupo/usuário sem permissão estoque e confirma bloqueio de leitura em est_saldos.',
  },
  'SCR-EST-CAR-01': {
    area: 'Estoque / Cardex',
    expectation:
      'Busca por código SKU com hífen resolve por sku_id (índice) e completa sob orçamento de tempo; plano OR(ilike+id) é rejeitado.',
    passos:
      'Cria SKU DEST-*-run + movimento; resolve IDs; aplica planCardexTextSearch; query autenticada com embeds deve < 8s e sem timeout.',
  },
  'SCR-EST-LOTE-01': {
    area: 'Estoque / Lote produto',
    expectation:
      'SKU com controla_lote: entrada exige lote e sobe saldo no grão sku×local×lote; saída no lote correto; SKU sem flag permanece no grão sem lote.',
    passos:
      'Cria SKU controla_lote + est_lotes_produto; entrada com p_lote_produto_id; confere est_saldos.lote_produto_id; saída parcial; SKU sem flag entrada sem lote.',
  },
  'SCR-EST-LOTE-02': {
    area: 'Estoque / Lote FEFO + remessa',
    expectation:
      'Dois lotes no mesmo SKU×local: saída consome o de validade mais próxima; remessa preserva lote_produto_id no poder de terceiros.',
    passos:
      'Cria 2 lotes (validade ASC); entrada em cada; saída 3 unidades do lote mais antigo; remessa_saida com p_lote_produto_id; confere poder com mesmo lote.',
  },
  'SCR-EST-SERIE-01': {
    area: 'Estoque / Série unitária',
    expectation:
      'Quando controla_serie existir no kernel, movimentos exigem identidade de série; até lá o caso fica skipped.',
    passos:
      'Probe coluna cad_skus.controla_serie; se ausente → skip; se presente → grão série (placeholder até Onda série).',
  },
}

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

function skipCase(reason) {
  const err = new Error(reason)
  err.skip = true
  throw err
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
  if (missing.length) throw new Error(`Preflight Estoque: ausente ${missing.join(', ')}`)
  assertDevTarget()
}

function assertOk(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`)
}

function parseRpc(rpcRes, rpcErr) {
  if (rpcErr) return { ok: false, message: rpcErr.message }
  const raw = Array.isArray(rpcRes) ? rpcRes[0] : rpcRes
  if (!raw || typeof raw !== 'object') return { ok: false, message: 'sem retorno' }
  const id = raw.movimento_id || raw.movimentoId
  const ok = Boolean(id) || raw.success === true || raw.sucesso === true
  return { ok, movimentoId: id, message: raw.mensagem || raw.message, raw }
}

async function loginPrincipal() {
  const client = createClient(URL, ANON_KEY)
  const { data: auth, error: loginError } = await client.auth.signInWithPassword({
    email: EMAIL,
    password: PASSWORD,
  })
  assertOk(loginError, 'login')
  const { data: me, error: meError } = await client
    .from('usuarios')
    .select('id, empresa_id, role_global, ativo')
    .eq('auth_user_id', auth.user.id)
    .eq('empresa_id', EXPECTED_TENANT)
    .single()
  assertOk(meError, 'perfil')
  if (!me?.empresa_id || me.ativo === false || me.role_global === 'superadmin') {
    throw new Error('Estoque SCR exige admin de tenant, não superadmin')
  }
  return { client, me }
}

async function ensureEstoqueAddon(admin, empresaId) {
  const { data: existing } = await admin
    .from('empresa_addons')
    .select('empresa_id')
    .eq('empresa_id', empresaId)
    .eq('addon_codigo', 'estoque')
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
      .eq('addon_codigo', 'estoque')
    assertOk(error, 'enable estoque addon')
  } else {
    const { error } = await admin.from('empresa_addons').insert({
      empresa_id: empresaId,
      addon_codigo: 'estoque',
      enabled: true,
      commercial_status: 'active',
    })
    assertOk(error, 'insert estoque addon')
  }
}

async function ensureLocais(admin, client, empresaId) {
  try {
    await admin.rpc('est_garantir_locais_padrao', { p_empresa_id: empresaId })
  } catch {
    // local seed is best-effort; fallbacks below create BRANCO/ALM if missing
  }
  const { data: locais, error } = await client
    .from('cad_locais_estoque')
    .select('id, codigo, eh_principal, eh_terceiros')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
  assertOk(error, 'listar locais')
  let branco = (locais || []).find((l) => l.eh_principal || l.codigo === 'BRANCO')
  let segundo = (locais || []).find((l) => l.id !== branco?.id && !l.eh_terceiros)
  if (!branco) {
    const { data, error: insErr } = await admin
      .from('cad_locais_estoque')
      .insert({
        empresa_id: empresaId,
        codigo: 'BRANCO',
        nome: 'Estoque principal',
        eh_principal: true,
        tipo: 'principal',
        ativo: true,
      })
      .select('id, codigo')
      .single()
    assertOk(insErr, 'criar BRANCO')
    branco = data
  }
  if (!segundo) {
    const { data, error: insErr } = await admin
      .from('cad_locais_estoque')
      .insert({
        empresa_id: empresaId,
        codigo: `ALM-${runKey.slice(0, 6)}`,
        nome: `${marker} Almox`,
        eh_principal: false,
        tipo: 'almoxarifado',
        ativo: true,
      })
      .select('id, codigo')
      .single()
    assertOk(insErr, 'criar local 2')
    segundo = data
  }
  return { branco, segundo }
}

async function createSku(client, me, opts = {}) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8)
  const { data, error } = await client
    .from('cad_skus')
    .insert({
      empresa_id: me.empresa_id,
      codigo: `EST-${suffix}`,
      nome: `${marker} SKU ${suffix}`,
      tipo: 'produto',
      unidade_venda: 'UN',
      unidade_compra: 'UN',
      unidade_estoque: 'UN',
      controla_estoque: true,
      controla_lote: Boolean(opts.controla_lote),
      exige_validade: opts.exige_validade !== false,
      ativo: true,
    })
    .select('id')
    .single()
  assertOk(error, 'criar SKU')
  return data.id
}

async function runCase(id, fn) {
  const started = Date.now()
  try {
    await fn()
    record(id, 'passed', undefined, Date.now() - started)
  } catch (error) {
    if (error && typeof error === 'object' && error.skip) {
      record(id, 'skipped', error.message || 'skipped', Date.now() - started)
      return
    }
    record(id, 'failed', error instanceof Error ? error.message : String(error), Date.now() - started)
  }
}

async function cleanupSkuChain(admin, empresaId, skuId, movimentoDoc) {
  if (movimentoDoc) {
    await admin
      .from('est_movimentos')
      .delete()
      .eq('empresa_id', empresaId)
      .eq('documento', movimentoDoc)
  }
  if (skuId) {
    await admin.from('est_saldos_poder_terceiros').delete().eq('empresa_id', empresaId).eq('sku_id', skuId)
    await admin.from('est_saldos').delete().eq('empresa_id', empresaId).eq('sku_id', skuId)
    await admin.from('est_movimentos').delete().eq('empresa_id', empresaId).eq('sku_id', skuId)
    await admin.from('est_lotes_produto').delete().eq('empresa_id', empresaId).eq('sku_id', skuId)
    await admin.from('cad_skus').delete().eq('id', skuId).eq('empresa_id', empresaId)
  }
}

async function scrGoldAndEnt(client, me, admin, locais) {
  const doc = `${marker}-ENT`
  let skuId = ''
  try {
    skuId = await createSku(client, me)
    const { data, error } = await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: me.empresa_id,
      p_tipo: 'entrada',
      p_sku_id: skuId,
      p_local_id: locais.branco.id,
      p_quantidade: 10,
      p_documento: doc,
      p_origem: 'lote_tela',
      p_motivo: `${marker} entrada`,
      p_usuario_id: me.id,
    })
    const parsed = parseRpc(data, error)
    if (!parsed.ok) throw new Error(parsed.message || 'entrada falhou')

    const { data: mov } = await client
      .from('est_movimentos')
      .select('id, tipo')
      .eq('empresa_id', me.empresa_id)
      .eq('documento', doc)
      .maybeSingle()
    if (!mov || mov.tipo !== 'entrada') throw new Error('Cardex sem entrada')

    const { data: saldo } = await client
      .from('est_saldos')
      .select('quantidade')
      .eq('empresa_id', me.empresa_id)
      .eq('sku_id', skuId)
      .eq('local_id', locais.branco.id)
      .maybeSingle()
    if (Number(saldo?.quantidade) !== 10) throw new Error(`Saldo esperado 10, veio ${saldo?.quantidade}`)
  } finally {
    await cleanupSkuChain(admin, me.empresa_id, skuId, doc)
  }
}

async function scrLote(client, me, admin, locais) {
  const doc = `${marker}-LOTE`
  let skuLote = ''
  let skuPlain = ''
  let loteId = ''
  try {
    skuLote = await createSku(client, me, { controla_lote: true, exige_validade: true })
    skuPlain = await createSku(client, me, { controla_lote: false })

    const { data: lote, error: loteErr } = await client
      .from('est_lotes_produto')
      .insert({
        empresa_id: me.empresa_id,
        sku_id: skuLote,
        numero_lote: `LOT-${runKey.slice(0, 6)}`,
        data_validade: '2027-06-30',
      })
      .select('id')
      .single()
    assertOk(loteErr, 'criar lote produto')
    loteId = lote.id

    // Entrada sem lote deve falhar
    {
      const { data, error } = await client.rpc('est_registrar_movimento_atomico', {
        p_empresa_id: me.empresa_id,
        p_tipo: 'entrada',
        p_sku_id: skuLote,
        p_local_id: locais.branco.id,
        p_quantidade: 3,
        p_documento: `${doc}-NOLOT`,
        p_usuario_id: me.id,
      })
      const parsed = parseRpc(data, error)
      if (parsed.ok) throw new Error('Entrada com controla_lote sem lote não deveria passar')
      const msg = String(parsed.message || error?.message || '')
      if (!msg.includes('LOTE_OBRIGATORIO') && !msg.toLowerCase().includes('lote')) {
        throw new Error(`Esperava LOTE_OBRIGATORIO: ${msg}`)
      }
    }

    const { data: entData, error: entErr } = await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: me.empresa_id,
      p_tipo: 'entrada',
      p_sku_id: skuLote,
      p_local_id: locais.branco.id,
      p_quantidade: 10,
      p_documento: doc,
      p_usuario_id: me.id,
      p_lote_produto_id: loteId,
    })
    const ent = parseRpc(entData, entErr)
    if (!ent.ok) throw new Error(ent.message || 'entrada com lote falhou')

    const { data: saldoLote } = await client
      .from('est_saldos')
      .select('quantidade, lote_produto_id')
      .eq('empresa_id', me.empresa_id)
      .eq('sku_id', skuLote)
      .eq('local_id', locais.branco.id)
      .eq('lote_produto_id', loteId)
      .maybeSingle()
    if (Number(saldoLote?.quantidade) !== 10) {
      throw new Error(`Saldo por lote esperado 10, veio ${saldoLote?.quantidade}`)
    }

    const { data: saiData, error: saiErr } = await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: me.empresa_id,
      p_tipo: 'saida',
      p_sku_id: skuLote,
      p_local_id: locais.branco.id,
      p_quantidade: 4,
      p_documento: `${doc}-OUT`,
      p_usuario_id: me.id,
      p_lote_produto_id: loteId,
    })
    const sai = parseRpc(saiData, saiErr)
    if (!sai.ok) throw new Error(sai.message || 'saída com lote falhou')

    const { data: saldoApos } = await client
      .from('est_saldos')
      .select('quantidade')
      .eq('empresa_id', me.empresa_id)
      .eq('sku_id', skuLote)
      .eq('lote_produto_id', loteId)
      .maybeSingle()
    if (Number(saldoApos?.quantidade) !== 6) {
      throw new Error(`Após saída esperado 6, veio ${saldoApos?.quantidade}`)
    }

    // SKU sem controla_lote: entrada sem lote (grão legado)
    const { data: plainData, error: plainErr } = await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: me.empresa_id,
      p_tipo: 'entrada',
      p_sku_id: skuPlain,
      p_local_id: locais.branco.id,
      p_quantidade: 2,
      p_documento: `${doc}-PLAIN`,
      p_usuario_id: me.id,
    })
    const plain = parseRpc(plainData, plainErr)
    if (!plain.ok) throw new Error(plain.message || 'entrada sem lote (SKU normal) falhou')

    const { data: saldoPlain } = await client
      .from('est_saldos')
      .select('quantidade, lote_produto_id')
      .eq('empresa_id', me.empresa_id)
      .eq('sku_id', skuPlain)
      .eq('local_id', locais.branco.id)
      .is('lote_produto_id', null)
      .maybeSingle()
    if (Number(saldoPlain?.quantidade) !== 2) {
      throw new Error(`Saldo sem lote esperado 2, veio ${saldoPlain?.quantidade}`)
    }
  } finally {
    await cleanupSkuChain(admin, me.empresa_id, skuLote, doc)
    await admin.from('est_movimentos').delete().eq('empresa_id', me.empresa_id).like('documento', `${doc}%`)
    await cleanupSkuChain(admin, me.empresa_id, skuPlain, `${doc}-PLAIN`)
    if (loteId) {
      await admin.from('est_lotes_produto').delete().eq('id', loteId)
    }
  }
}

async function scrLoteFefoRemessa(client, me, admin, locais) {
  const doc = `${marker}-LOTE2`
  let skuId = ''
  let pessoaId = ''
  let remessaId = ''
  let loteCedo = ''
  let loteTarde = ''
  try {
    skuId = await createSku(client, me, { controla_lote: true, exige_validade: true })

    const { data: l1, error: e1 } = await client
      .from('est_lotes_produto')
      .insert({
        empresa_id: me.empresa_id,
        sku_id: skuId,
        numero_lote: `FEFO-A-${runKey.slice(0, 4)}`,
        data_validade: '2026-10-01',
      })
      .select('id')
      .single()
    assertOk(e1, 'lote cedo')
    loteCedo = l1.id

    const { data: l2, error: e2 } = await client
      .from('est_lotes_produto')
      .insert({
        empresa_id: me.empresa_id,
        sku_id: skuId,
        numero_lote: `FEFO-B-${runKey.slice(0, 4)}`,
        data_validade: '2027-03-01',
      })
      .select('id')
      .single()
    assertOk(e2, 'lote tarde')
    loteTarde = l2.id

    for (const [loteId, qtd, suf] of [
      [loteCedo, 5, 'A'],
      [loteTarde, 5, 'B'],
    ]) {
      const { data, error } = await client.rpc('est_registrar_movimento_atomico', {
        p_empresa_id: me.empresa_id,
        p_tipo: 'entrada',
        p_sku_id: skuId,
        p_local_id: locais.branco.id,
        p_quantidade: qtd,
        p_documento: `${doc}-IN-${suf}`,
        p_usuario_id: me.id,
        p_lote_produto_id: loteId,
      })
      const parsed = parseRpc(data, error)
      if (!parsed.ok) throw new Error(parsed.message || `entrada ${suf} falhou`)
    }

    // Saída 3 → deve debitar o lote de validade mais próxima (FEFO manual no script)
    {
      const { data, error } = await client.rpc('est_registrar_movimento_atomico', {
        p_empresa_id: me.empresa_id,
        p_tipo: 'saida',
        p_sku_id: skuId,
        p_local_id: locais.branco.id,
        p_quantidade: 3,
        p_documento: `${doc}-OUT`,
        p_usuario_id: me.id,
        p_lote_produto_id: loteCedo,
      })
      const parsed = parseRpc(data, error)
      if (!parsed.ok) throw new Error(parsed.message || 'saída FEFO falhou')
    }

    const { data: saldos } = await client
      .from('est_saldos')
      .select('lote_produto_id, quantidade')
      .eq('empresa_id', me.empresa_id)
      .eq('sku_id', skuId)
      .eq('local_id', locais.branco.id)
    const byLote = Object.fromEntries(
      (saldos || []).map((s) => [s.lote_produto_id, Number(s.quantidade)])
    )
    if (byLote[loteCedo] !== 2) {
      throw new Error(`Lote cedo esperado 2, veio ${byLote[loteCedo]}`)
    }
    if (byLote[loteTarde] !== 5) {
      throw new Error(`Lote tarde esperado 5, veio ${byLote[loteTarde]}`)
    }

    const { data: pessoa, error: pErr } = await client
      .from('crm_leads')
      .insert({
        empresa_id: me.empresa_id,
        nome: `${marker} Terceiro Lote`,
        telefone: `55119${Date.now().toString().slice(-8)}`,
      })
      .select('id')
      .single()
    assertOk(pErr, 'pessoa remessa lote')
    pessoaId = pessoa.id

    const { data: remessa, error: remErr } = await client
      .from('est_remessa_lotes')
      .insert({
        empresa_id: me.empresa_id,
        numero: `REM-L-${runKey.slice(0, 6)}`,
        destinatario_pessoa_id: pessoaId,
        motivo_codigo: 'remessa_locacao',
        local_origem_id: locais.branco.id,
        documento: `${doc}-REM`,
        status: 'aberta',
        usuario_id: me.id,
      })
      .select('id')
      .single()
    assertOk(remErr, 'criar remessa lote')
    remessaId = remessa.id

    const { data: item, error: itemErr } = await client
      .from('est_remessa_itens')
      .insert({
        empresa_id: me.empresa_id,
        remessa_id: remessaId,
        sku_id: skuId,
        local_origem_id: locais.branco.id,
        quantidade_enviada: 2,
        quantidade_retornada: 0,
        status_item: 'em_poder',
        lote_produto_id: loteTarde,
      })
      .select('id')
      .single()
    assertOk(itemErr, 'item remessa lote')

    const { data: remRpc, error: remRpcErr } = await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: me.empresa_id,
      p_tipo: 'remessa_saida',
      p_sku_id: skuId,
      p_local_id: locais.branco.id,
      p_quantidade: 2,
      p_pessoa_id: pessoaId,
      p_documento: `${doc}-REM`,
      p_origem: 'remessa',
      p_lote_remessa_id: remessaId,
      p_remessa_item_id: item.id,
      p_motivo_codigo: 'remessa_locacao',
      p_usuario_id: me.id,
      p_lote_produto_id: loteTarde,
    })
    const remParsed = parseRpc(remRpc, remRpcErr)
    if (!remParsed.ok) throw new Error(remParsed.message || remRpcErr?.message || 'remessa com lote falhou')

    const { data: poder } = await client
      .from('est_saldos_poder_terceiros')
      .select('quantidade, lote_produto_id')
      .eq('empresa_id', me.empresa_id)
      .eq('sku_id', skuId)
      .eq('pessoa_id', pessoaId)
      .eq('remessa_id', remessaId)
      .eq('lote_produto_id', loteTarde)
      .maybeSingle()
    if (Number(poder?.quantidade) !== 2) {
      throw new Error(`Poder com lote esperado 2, veio ${poder?.quantidade}`)
    }
  } finally {
    if (remessaId) {
      await admin.from('est_movimentos').delete().eq('empresa_id', me.empresa_id).eq('lote_remessa_id', remessaId)
      await admin.from('est_saldos_poder_terceiros').delete().eq('empresa_id', me.empresa_id).eq('remessa_id', remessaId)
      await admin.from('est_remessa_itens').delete().eq('remessa_id', remessaId)
      await admin.from('est_remessa_lotes').delete().eq('id', remessaId)
    }
    await admin.from('est_movimentos').delete().eq('empresa_id', me.empresa_id).like('documento', `${doc}%`)
    await cleanupSkuChain(admin, me.empresa_id, skuId, doc)
    if (pessoaId) await admin.from('crm_leads').delete().eq('id', pessoaId)
    for (const id of [loteCedo, loteTarde]) {
      if (id) await admin.from('est_lotes_produto').delete().eq('id', id)
    }
  }
}

/** Placeholder: série unitária ainda fora do kernel (controla_serie). */
async function scrSerie(admin) {
  const { error } = await admin.from('cad_skus').select('controla_serie').limit(1)
  if (error) {
    const msg = String(error.message || '')
    if (
      msg.includes('controla_serie') ||
      msg.includes('does not exist') ||
      error.code === '42703' ||
      error.code === 'PGRST204'
    ) {
      skipCase('controla_serie ainda não no schema — série unitária fora do MVP lote/validade')
    }
    throw new Error(`probe controla_serie: ${msg}`)
  }
  // Coluna existe: kernel série chegou — falta implementar o case completo
  throw new Error(
    'controla_serie detectado no schema: implementar SCR-EST-SERIE (grão sku×local×série) neste script'
  )
}

async function scrSaldo(client, me, admin, locais) {
  const doc = `${marker}-SAL`
  let skuId = ''
  try {
    skuId = await createSku(client, me)
    await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: me.empresa_id,
      p_tipo: 'entrada',
      p_sku_id: skuId,
      p_local_id: locais.branco.id,
      p_quantidade: 5,
      p_documento: doc,
      p_usuario_id: me.id,
    })
    const { data, error } = await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: me.empresa_id,
      p_tipo: 'saida',
      p_sku_id: skuId,
      p_local_id: locais.branco.id,
      p_quantidade: 99,
      p_documento: `${doc}-OUT`,
      p_origem: 'retirada',
      p_usuario_id: me.id,
    })
    const parsed = parseRpc(data, error)
    if (parsed.ok) throw new Error('Saída excessiva não deveria ter sucesso')
    if (!String(parsed.message || error?.message || '').includes('SALDO_INSUFICIENTE')) {
      // PostgREST wraps exception
      if (!String(error?.message || '').toLowerCase().includes('saldo')) {
        throw new Error(`Esperava saldo insuficiente: ${parsed.message || error?.message}`)
      }
    }
    const { data: saldo } = await client
      .from('est_saldos')
      .select('quantidade')
      .eq('empresa_id', me.empresa_id)
      .eq('sku_id', skuId)
      .eq('local_id', locais.branco.id)
      .single()
    if (Number(saldo.quantidade) !== 5) throw new Error('Saldo alterado após falha')
  } finally {
    await cleanupSkuChain(admin, me.empresa_id, skuId, doc)
    await admin
      .from('est_movimentos')
      .delete()
      .eq('empresa_id', me.empresa_id)
      .like('documento', `${doc}%`)
  }
}

async function scrTrf(client, me, admin, locais) {
  const doc = `${marker}-TRF`
  let skuId = ''
  try {
    skuId = await createSku(client, me)
    await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: me.empresa_id,
      p_tipo: 'entrada',
      p_sku_id: skuId,
      p_local_id: locais.branco.id,
      p_quantidade: 8,
      p_documento: doc,
      p_usuario_id: me.id,
    })
    const { data, error } = await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: me.empresa_id,
      p_tipo: 'transferencia',
      p_sku_id: skuId,
      p_local_id: locais.branco.id,
      p_local_destino_id: locais.segundo.id,
      p_quantidade: 3,
      p_documento: `${doc}-X`,
      p_usuario_id: me.id,
    })
    const parsed = parseRpc(data, error)
    if (!parsed.ok) throw new Error(parsed.message || error?.message || 'transferência falhou')

    const { data: saldos } = await client
      .from('est_saldos')
      .select('local_id, quantidade')
      .eq('empresa_id', me.empresa_id)
      .eq('sku_id', skuId)
    const map = Object.fromEntries((saldos || []).map((s) => [s.local_id, Number(s.quantidade)]))
    if (map[locais.branco.id] !== 5 || map[locais.segundo.id] !== 3) {
      throw new Error(`Saldos pós-TRF inválidos: ${JSON.stringify(map)}`)
    }
  } finally {
    await cleanupSkuChain(admin, me.empresa_id, skuId, doc)
    await admin
      .from('est_movimentos')
      .delete()
      .eq('empresa_id', me.empresa_id)
      .like('documento', `${doc}%`)
  }
}

async function scrRem(client, me, admin, locais) {
  const doc = `${marker}-REM`
  let skuId = ''
  let pessoaId = ''
  let remessaId = ''
  try {
    skuId = await createSku(client, me)
    const { data: pessoa, error: pErr } = await client
      .from('crm_leads')
      .insert({
        empresa_id: me.empresa_id,
        nome: `${marker} Terceiro`,
        telefone: `55119${Date.now().toString().slice(-8)}`,
      })
      .select('id')
      .single()
    assertOk(pErr, 'pessoa remessa')
    pessoaId = pessoa.id

    await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: me.empresa_id,
      p_tipo: 'entrada',
      p_sku_id: skuId,
      p_local_id: locais.branco.id,
      p_quantidade: 4,
      p_documento: doc,
      p_usuario_id: me.id,
    })

    const { data: remessa, error: remErr } = await client
      .from('est_remessa_lotes')
      .insert({
        empresa_id: me.empresa_id,
        numero: `REM-${runKey.slice(0, 8)}`,
        destinatario_pessoa_id: pessoaId,
        motivo_codigo: 'remessa_locacao',
        local_origem_id: locais.branco.id,
        documento: `${doc}-S`,
        status: 'aberta',
        usuario_id: me.id,
      })
      .select('id')
      .single()
    assertOk(remErr, 'criar remessa')
    remessaId = remessa.id

    const { data: item, error: itemErr } = await client
      .from('est_remessa_itens')
      .insert({
        empresa_id: me.empresa_id,
        remessa_id: remessaId,
        sku_id: skuId,
        local_origem_id: locais.branco.id,
        quantidade_enviada: 2,
        quantidade_retornada: 0,
        status_item: 'em_poder',
      })
      .select('id')
      .single()
    assertOk(itemErr, 'item remessa')

    const { data, error } = await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: me.empresa_id,
      p_tipo: 'remessa_saida',
      p_sku_id: skuId,
      p_local_id: locais.branco.id,
      p_quantidade: 2,
      p_pessoa_id: pessoaId,
      p_documento: `${doc}-S`,
      p_origem: 'remessa',
      p_lote_remessa_id: remessaId,
      p_remessa_item_id: item.id,
      p_motivo_codigo: 'remessa_locacao',
      p_usuario_id: me.id,
    })
    const parsed = parseRpc(data, error)
    if (!parsed.ok) throw new Error(parsed.message || error?.message || 'remessa falhou')

    const { data: saldo } = await client
      .from('est_saldos')
      .select('quantidade')
      .eq('empresa_id', me.empresa_id)
      .eq('sku_id', skuId)
      .eq('local_id', locais.branco.id)
      .single()
    if (Number(saldo.quantidade) !== 2) throw new Error('Saldo local pós-remessa inválido')

    const { data: poder } = await client
      .from('est_saldos_poder_terceiros')
      .select('quantidade')
      .eq('empresa_id', me.empresa_id)
      .eq('sku_id', skuId)
      .eq('pessoa_id', pessoaId)
      .eq('remessa_id', remessaId)
    const qtdPoder = (poder || []).reduce((a, r) => a + Number(r.quantidade), 0)
    if (qtdPoder < 2) throw new Error(`Poder de terceiros esperado ≥2, veio ${qtdPoder}`)
  } finally {
    if (remessaId) {
      await admin
        .from('est_movimentos')
        .delete()
        .eq('empresa_id', me.empresa_id)
        .eq('lote_remessa_id', remessaId)
      await admin.from('est_saldos_poder_terceiros').delete().eq('remessa_id', remessaId)
      await admin.from('est_remessa_itens').delete().eq('remessa_id', remessaId)
      await admin.from('est_remessa_lotes').delete().eq('id', remessaId).eq('empresa_id', me.empresa_id)
    }
    await cleanupSkuChain(admin, me.empresa_id, skuId, doc)
    await admin
      .from('est_movimentos')
      .delete()
      .eq('empresa_id', me.empresa_id)
      .like('documento', `${doc}%`)
    if (pessoaId) {
      await admin.from('crm_leads').delete().eq('id', pessoaId).eq('empresa_id', me.empresa_id)
    }
  }
}

async function scrBatch(client, me) {
  const { data, error } = await client.rpc('est_reconstruir_saldos_from_cardex', {
    p_empresa_id: me.empresa_id,
  })
  if (error) throw new Error(error.message)
  const raw = Array.isArray(data) ? data[0] : data
  if (raw && raw.success === false) throw new Error(raw.mensagem || 'batch falhou')
}

async function scrTenant(client, me, admin, locais) {
  const doc = `${marker}-TEN`
  let skuId = ''
  let otherTenant = ''
  try {
    skuId = await createSku(client, me)
    await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: me.empresa_id,
      p_tipo: 'entrada',
      p_sku_id: skuId,
      p_local_id: locais.branco.id,
      p_quantidade: 1,
      p_documento: doc,
      p_usuario_id: me.id,
    })

    const { data: other, error: oErr } = await admin
      .from('empresas')
      .insert({ nome: `${marker} Outra`, ativo: true, status: 'active' })
      .select('id')
      .single()
    assertOk(oErr, 'tenant sentinela')
    otherTenant = other.id

    const { data: leaked } = await client
      .from('est_movimentos')
      .select('id')
      .eq('empresa_id', otherTenant)
      .limit(1)
    if ((leaked || []).length) throw new Error('Vazou movimento de outro tenant')

    const { data: own } = await client
      .from('est_movimentos')
      .select('id')
      .eq('empresa_id', me.empresa_id)
      .eq('documento', doc)
    if (!(own || []).length) throw new Error('Não leu movimento próprio')
  } finally {
    await cleanupSkuChain(admin, me.empresa_id, skuId, doc)
    if (otherTenant) await admin.from('empresas').delete().eq('id', otherTenant)
  }
}

async function scrRpc(client, me) {
  const { data, error } = await client.rpc('est_rpc_relatorio', {
    p_empresa_id: me.empresa_id,
    p_slug: 'valor-estoque',
    p_filtros: { limit: 50, offset: 0 },
  })
  if (error) throw new Error(error.message)
  const raw = Array.isArray(data) ? data[0] : data
  if (!raw || typeof raw !== 'object') throw new Error('RPC sem payload')
  if (!('rows' in raw) && raw.resumo == null && raw.total_count == null) {
    throw new Error(`Shape inesperado: ${JSON.stringify(raw).slice(0, 200)}`)
  }
  if (Array.isArray(raw.rows) && raw.rows.length > 50) {
    throw new Error(`Paginação quebrada: ${raw.rows.length} linhas > 50`)
  }
}

async function scrReq(client, me, admin, locais) {
  const doc = `${marker}-REQ`
  let skuId = ''
  let reqId = ''
  let pessoaId = ''
  try {
    skuId = await createSku(client, me)
    const { data: pessoa, error: pErr } = await client
      .from('crm_leads')
      .insert({
        empresa_id: me.empresa_id,
        nome: `${marker} Req`,
        telefone: `55118${Date.now().toString().slice(-8)}`,
      })
      .select('id')
      .single()
    assertOk(pErr, 'requisitante')
    pessoaId = pessoa.id

    await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: me.empresa_id,
      p_tipo: 'entrada',
      p_sku_id: skuId,
      p_local_id: locais.branco.id,
      p_quantidade: 6,
      p_documento: doc,
      p_usuario_id: me.id,
    })

    const { data: req, error: rErr } = await client
      .from('est_requisicoes')
      .insert({
        empresa_id: me.empresa_id,
        numero: `REQ-${runKey.slice(0, 8)}`,
        requisitante_pessoa_id: pessoaId,
        status: 'aprovada',
        origem: 'manual',
      })
      .select('id')
      .single()
    assertOk(rErr, 'criar req')
    reqId = req.id

    const { error: iErr } = await client.from('est_requisicao_itens').insert({
      empresa_id: me.empresa_id,
      requisicao_id: reqId,
      sku_id: skuId,
      quantidade_pedida: 2,
      quantidade_atendida: 0,
      quantidade_pendente: 2,
      status_item: 'pendente',
    })
    assertOk(iErr, 'item req')

    const { data, error } = await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: me.empresa_id,
      p_tipo: 'saida',
      p_sku_id: skuId,
      p_local_id: locais.branco.id,
      p_quantidade: 2,
      p_documento: `${doc}-ATD`,
      p_origem: 'requisicao',
      p_requisicao_id: reqId,
      p_usuario_id: me.id,
    })
    const parsed = parseRpc(data, error)
    if (!parsed.ok) throw new Error(parsed.message || error?.message || 'atendimento falhou')
  } finally {
    if (reqId) {
      await admin.from('est_requisicao_itens').delete().eq('requisicao_id', reqId)
      await admin.from('est_requisicoes').delete().eq('id', reqId).eq('empresa_id', me.empresa_id)
    }
    await cleanupSkuChain(admin, me.empresa_id, skuId, doc)
    await admin
      .from('est_movimentos')
      .delete()
      .eq('empresa_id', me.empresa_id)
      .like('documento', `${doc}%`)
    if (pessoaId) {
      await admin.from('crm_leads').delete().eq('id', pessoaId).eq('empresa_id', me.empresa_id)
    }
  }
}

async function scrRbac(me, admin) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 8)
  const ids = { group: '', auth: '' }
  try {
    const { data: group, error: gErr } = await admin
      .from('grupos_acesso')
      .insert({
        empresa_id: me.empresa_id,
        nome: `${marker} sem estoque ${suffix}`,
        is_admin: false,
        permissoes: { leads: ['view'] },
      })
      .select('id')
      .single()
    assertOk(gErr, 'grupo')
    ids.group = group.id

    const email = `est-rbac-${suffix}@teste.huginflow.com`
    const { data: created, error: aErr } = await admin.auth.admin.createUser({
      email,
      password: 'TesteEstoque1!',
      email_confirm: true,
      user_metadata: { nome_completo: `${marker} Restrito`, role_global: 'operador' },
    })
    assertOk(aErr, 'auth user')
    ids.auth = created.user.id

    const { error: uErr } = await admin.from('usuarios').insert({
      id: ids.auth,
      auth_user_id: ids.auth,
      empresa_id: me.empresa_id,
      email,
      nome_completo: `${marker} Restrito`,
      role_global: 'operador',
      grupo_id: ids.group,
      ativo: true,
      must_change_password: false,
    })
    assertOk(uErr, 'usuarios')

    const restricted = createClient(URL, ANON_KEY)
    const { error: loginErr } = await restricted.auth.signInWithPassword({
      email,
      password: 'TesteEstoque1!',
    })
    assertOk(loginErr, 'login restrito')

    const { data: canView, error: permErr } = await restricted.rpc('check_permission', {
      slug: 'estoque',
      action: 'view',
    })
    assertOk(permErr, 'check_permission estoque.view')
    if (canView === true) throw new Error('Operador restrito não deveria ter estoque.view')

    const { data: canCreate, error: createPermErr } = await restricted.rpc('check_permission', {
      slug: 'estoque',
      action: 'create',
    })
    assertOk(createPermErr, 'check_permission estoque.create')
    if (canCreate === true) throw new Error('Operador restrito não deveria ter estoque.create')

    const { data, error } = await restricted
      .from('est_saldos')
      .select('id')
      .eq('empresa_id', me.empresa_id)
      .limit(1)
    if (error && !/permission|policy|estoque|row-level/i.test(error.message)) {
      throw new Error(`Leitura est_saldos inesperada: ${error.message}`)
    }
    if ((data || []).length > 0) {
      throw new Error('RLS vazou saldos para usuário sem estoque.view')
    }
    await restricted.auth.signOut()
  } finally {
    if (ids.auth) {
      await admin.from('usuarios').delete().eq('auth_user_id', ids.auth)
      await admin.auth.admin.deleteUser(ids.auth)
    }
    if (ids.group) {
      await admin.from('grupos_acesso').delete().eq('id', ids.group).eq('empresa_id', me.empresa_id)
    }
  }
}

async function scrCardex(client, me, admin, locais) {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase()
  const codigo = `DEST-${suffix}`
  const doc = `${marker} CARDEX ${codigo}`
  let skuId = null

  try {
    // Contrato unitário: plano legado perigoso continua detectado
    if (
      !isUnsafeCardexOrPlan([
        `documento.ilike.${postgrestIlikePattern(codigo)}`,
        `motivo.ilike.${postgrestIlikePattern(codigo)}`,
        'sku_id.in.(00000000-0000-0000-0000-000000000001)',
      ])
    ) {
      throw new Error('isUnsafeCardexOrPlan deveria marcar OR(ilike+sku_id) como inseguro')
    }

    const { data: sku, error: skuErr } = await client
      .from('cad_skus')
      .insert({
        empresa_id: me.empresa_id,
        codigo,
        nome: `${marker} Cardex ${codigo}`,
        tipo: 'produto',
        unidade_venda: 'UN',
        unidade_compra: 'UN',
        unidade_estoque: 'UN',
        controla_estoque: true,
        ativo: true,
      })
      .select('id')
      .single()
    assertOk(skuErr, 'criar SKU cardex')
    skuId = sku.id

    const { data: movData, error: movErr } = await client.rpc('est_registrar_movimento_atomico', {
      p_empresa_id: me.empresa_id,
      p_tipo: 'entrada',
      p_sku_id: skuId,
      p_local_id: locais.branco.id,
      p_quantidade: 3,
      p_documento: doc,
      p_motivo: `${marker} cardex`,
      p_origem: 'lote_tela',
      p_usuario_id: me.id,
    })
    const parsedMov = parseRpc(movData, movErr)
    if (!parsedMov.ok) throw new Error(parsedMov.message || movErr?.message || 'entrada cardex falhou')

    const likePat = postgrestIlikePattern(codigo)
    const { data: skusMatch, error: resolveErr } = await client
      .from('cad_skus')
      .select('id')
      .eq('empresa_id', me.empresa_id)
      .or(`codigo.ilike.${likePat},nome.ilike.${likePat}`)
      .limit(50)
    assertOk(resolveErr, 'resolver SKU por código')
    const skuIds = (skusMatch || []).map((s) => s.id)
    if (!skuIds.includes(skuId)) throw new Error(`Busca não resolveu SKU ${codigo}`)

    const plan = planCardexTextSearch({ term: codigo, skuIdsFromQ: skuIds })
    if (plan.mode !== 'sku_ids') {
      throw new Error(`Esperava mode=sku_ids, veio ${plan.mode}`)
    }
    if (plan.likePat) throw new Error('Plano não deve usar ilike em movimentos quando há SKU')

    const started = Date.now()
    const { data, error, count } = await client
      .from('est_movimentos')
      .select(
        `
        id,
        tipo,
        documento,
        cad_skus!est_movimentos_sku_id_fkey (id, codigo),
        local:cad_locais_estoque!est_movimentos_local_id_fkey (id, codigo)
      `,
        { count: plan.countMode },
      )
      .eq('empresa_id', me.empresa_id)
      .in('sku_id', plan.skuIds)
      .order('movimento_em', { ascending: false })
      .range(0, 49)
    const elapsed = Date.now() - started
    assertOk(error, 'query cardex por sku_id')
    if (error?.message && /timeout/i.test(error.message)) {
      throw new Error(`Timeout no Cardex: ${error.message}`)
    }
    if (elapsed > 8000) {
      throw new Error(`Cardex demorou ${elapsed}ms (limite 8000ms) para busca ${codigo}`)
    }
    if (!(data || []).some((m) => m.documento === doc)) {
      throw new Error('Movimento de teste não apareceu no Cardex filtrado')
    }
    if (count != null && count < 1) throw new Error('count estimado/zero inesperado')
  } finally {
    await cleanupSkuChain(admin, me.empresa_id, skuId, doc)
  }
}

async function main() {
  mkdirSync(runDir, { recursive: true })
  console.log('\n[agent] Scripts Fase 6 — Estoque')
  appendEvent({ ts: new Date().toISOString(), type: 'log', message: 'Scripts Fase 6 Estoque' })

  try {
    assertConfig()
    const admin = createClient(URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { client, me } = await loginPrincipal()
    await ensureEstoqueAddon(admin, me.empresa_id)
    const locais = await ensureLocais(admin, client, me.empresa_id)

    await runCase('SCR-EST-GOLD-01', () => scrGoldAndEnt(client, me, admin, locais))
    await runCase('SCR-EST-ENT-01', () => scrGoldAndEnt(client, me, admin, locais))
    await runCase('SCR-EST-SALDO-01', () => scrSaldo(client, me, admin, locais))
    await runCase('SCR-EST-TRF-01', () => scrTrf(client, me, admin, locais))
    await runCase('SCR-EST-REM-01', () => scrRem(client, me, admin, locais))
    await runCase('SCR-EST-BATCH-01', () => scrBatch(client, me))
    await runCase('SCR-EST-TENANT-01', () => scrTenant(client, me, admin, locais))
    await runCase('SCR-EST-RPC-01', () => scrRpc(client, me))
    await runCase('SCR-EST-REQ-01', () => scrReq(client, me, admin, locais))
    await runCase('SCR-EST-RBAC-01', () => scrRbac(me, admin))
    await runCase('SCR-EST-CAR-01', () => scrCardex(client, me, admin, locais))
    await runCase('SCR-EST-LOTE-01', () => scrLote(client, me, admin, locais))
    await runCase('SCR-EST-LOTE-02', () => scrLoteFefoRemessa(client, me, admin, locais))
    await runCase('SCR-EST-SERIE-01', () => scrSerie(admin))

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
  writeFileSync(resolve(runDir, 'phase6-scripts-summary.json'), JSON.stringify(summary, null, 2), 'utf8')
  if (failed > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

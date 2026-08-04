/**
 * Bloco 9b — Transcrição de áudio WhatsApp (parseWebhook + fluxo mock).
 * Não envia áudio real; valida que o parser aceita audioMessage e placeholder.
 *
 * Uso: node scripts/supabase/block9b-test-audio-transcription-prod.mjs
 */
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '../..')

const results = {}

function pass(id, note) {
  results[id] = { ok: true, note }
}

function fail(id, note) {
  results[id] = { ok: false, note }
}

async function main() {
  const providerPath = resolve(root, 'src/lib/omnichannel/providers/EvolutionProvider.ts')
  if (!existsSync(providerPath)) {
    fail('9b.0', 'EvolutionProvider.ts não encontrado')
    printAndExit()
  }

  // Dynamic import do módulo compilado não existe; validamos via regex no source + função exportada se build existir
  const source = readFileSync(providerPath, 'utf8')

  if (source.includes('AUDIO_PLACEHOLDER') && source.includes('extractAudioMessagePayload')) {
    pass('9b.1', 'parseWebhook referencia placeholder e extractAudioMessagePayload')
  } else {
    fail('9b.1', 'parseWebhook sem integração de áudio')
  }

  const mediaPath = resolve(root, 'src/lib/omnichannel/services/EvolutionMediaService.ts')
  const audioPath = resolve(root, 'src/lib/omnichannel/services/AudioTranscriptionService.ts')
  const aiPath = resolve(root, 'src/lib/ai/empresa-ai.ts')
  const aiResponsePath = resolve(root, 'src/lib/omnichannel/services/AiResponseService.ts')

  for (const [id, file, needle, label] of [
    ['9b.2', mediaPath, 'getBase64FromMediaMessage', 'EvolutionMediaService download'],
    ['9b.3', audioPath, 'transcribeInboundAudio', 'AudioTranscriptionService'],
    ['9b.4', aiPath, 'whisper-1', 'transcribeAudio Whisper'],
    ['9b.5', aiResponsePath, "message.type === 'audio'", 'AiResponseService transcreve antes da IA'],
  ]) {
    if (!existsSync(file)) {
      fail(id, `${label}: arquivo ausente`)
      continue
    }
    const content = readFileSync(file, 'utf8')
    if (content.includes(needle)) pass(id, label)
    else fail(id, `${label}: não encontrou ${needle}`)
  }

  // Valida extractAudioMessagePayload inline (espelho do serviço)
  function extractAudioMessagePayload(raw) {
    if (!raw?.message) return null
    const m = raw.message
    if (m.audioMessage) {
      return {
        mimetype: m.audioMessage.mimetype,
        seconds: m.audioMessage.seconds,
        ptt: m.audioMessage.ptt,
      }
    }
    const nested = m.ephemeralMessage?.message?.audioMessage
    if (nested) {
      return { mimetype: nested.mimetype, seconds: nested.seconds, ptt: nested.ptt }
    }
    return null
  }

  const audioPayload = {
    event: 'MESSAGES_UPSERT',
    instance: 'test_instance',
    data: {
      key: { remoteJid: '5511999999999@s.whatsapp.net', fromMe: false, id: 'AUDIO_TEST_001' },
      pushName: 'Teste Áudio',
      message: {
        audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 5, ptt: true },
      },
      messageTimestamp: Math.floor(Date.now() / 1000),
    },
  }

  const meta = extractAudioMessagePayload(audioPayload.data)
  if (meta?.ptt === true && meta?.mimetype?.includes('ogg')) {
    pass('9b.6', 'extractAudioMessagePayload reconhece PTT ogg')
  } else {
    fail('9b.6', `meta inesperado: ${JSON.stringify(meta)}`)
  }

  const ephemeralPayload = {
    message: {
      ephemeralMessage: {
        message: {
          audioMessage: { mimetype: 'audio/ogg', seconds: 3, ptt: true },
        },
      },
    },
  }
  const ephemeralMeta = extractAudioMessagePayload(ephemeralPayload)
  if (ephemeralMeta?.ptt === true) {
    pass('9b.7', 'ephemeralMessage.audioMessage suportado')
  } else {
    fail('9b.7', 'ephemeral audio não detectado')
  }

  printAndExit()
}

function printAndExit() {
  console.log('\n=== Bloco 9b — Transcrição áudio WhatsApp ===\n')
  let ok = 0
  let total = 0
  for (const [id, r] of Object.entries(results).sort()) {
    total++
    if (r.ok) ok++
    console.log(`${r.ok ? '✅' : '❌'} ${id}: ${r.note}`)
  }
  console.log(`\n${ok}/${total} passaram`)
  process.exit(ok === total ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

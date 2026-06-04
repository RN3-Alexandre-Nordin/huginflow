import {
  getEvolutionCredentials,
  getOmnichannelConfig,
} from '@/lib/config/environment'

export class EvolutionApiService {
  /** Extrai base64 do QR a partir de qualquer formato retornado pela Evolution. */
  static extractQrFromPayload(data: unknown): string | null {
    if (!data || typeof data !== 'object') return null
    const payload = data as Record<string, unknown>
    const nested = payload.qrcode
    const candidates = [
      typeof nested === 'object' && nested !== null
        ? (nested as Record<string, unknown>).base64
        : null,
      payload.base64,
      typeof nested === 'string' ? nested : null,
      payload.code,
    ]
    for (const value of candidates) {
      if (typeof value === 'string' && value.length > 0) {
        return this.normalizeQrBase64(value)
      }
    }
    return null
  }

  /** Garante prefixo data:image para uso em <img src>. */
  static normalizeQrBase64(value: string): string {
    if (value.startsWith('data:image')) return value
    return `data:image/png;base64,${value}`
  }

  private static getBaseUrl(customUrl?: string) {
    return getEvolutionCredentials(customUrl).apiUrl
  }

  private static getApiKey(customKey?: string) {
    return getEvolutionCredentials(undefined, customKey).apiKey
  }

  /**
   * Cria uma nova instância na Evolution API (WHATSAPP-BAILEYS).
   * Retorna o objeto completo da resposta, incluindo o base64 do QR Code.
   */
  static async createInstance(
    instanceName: string,
    customUrl?: string,
    customKey?: string,
    options: { token?: string; number?: string } = {},
  ) {
    const { apiUrl, apiKey, webhookUrl, environment } = getEvolutionCredentials(
      customUrl,
      customKey,
    )

    console.log(
      `[EvolutionApiService] ambiente=${environment} instância=${instanceName} evolution=${apiUrl} webhook=${webhookUrl}`,
    )

    const body: Record<string, unknown> = {
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      webhook: {
        enabled: true,
        url: webhookUrl,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE',
          'CONNECTION_UPDATE',
          'PRESENCE_UPDATE',
          'CHATS_UPSERT',
          'CONTACTS_UPSERT',
        ],
      },
      reject_call: true,
      msg_call:
        'Olá! Este número é automatizado e não recebe chamadas. Por favor, envie sua dúvida por texto.',
      groups_ignore: true,
      always_online: true,
      read_messages: false,
      read_status: false,
      sync_full_history: false,
    }

    if (options.token) body.token = options.token
    if (options.number) body.number = options.number

    const response = await fetch(`${apiUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify(body),
    })

    const data = await response.json()

    if (!response.ok) {
      const errorMsg =
        (Array.isArray(data?.response?.message) ? data.response.message[0] : null) ||
        data?.response?.message ||
        data?.message ||
        data?.error ||
        JSON.stringify(data)
      throw new Error(`Evolution API (${response.status}): ${errorMsg}`)
    }

    return data
  }

  static async setInstanceSettings(
    instanceName: string,
    settings: Record<string, unknown>,
    customUrl?: string,
    customKey?: string,
  ) {
    const { apiUrl, apiKey } = getEvolutionCredentials(customUrl, customKey)

    const response = await fetch(`${apiUrl}/settings/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: apiKey,
      },
      body: JSON.stringify(settings),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Erro ao definir settings na Evolution API:', data)
      return { success: false, error: data }
    }

    return { success: true, data }
  }

  static async registerWebhook(
    instanceName: string,
    webhookUrl?: string,
    customUrl?: string,
    customKey?: string,
  ) {
    const creds = getEvolutionCredentials(customUrl, customKey)
    const url = webhookUrl ?? creds.webhookUrl

    const response = await fetch(`${creds.apiUrl}/webhook/set/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: creds.apiKey,
      },
      body: JSON.stringify({
        webhook: {
          url,
          enabled: true,
          byEvents: false,
          base64: false,
          events: [
            'CONNECTION_UPDATE',
            'MESSAGES_UPSERT',
            'MESSAGES_UPDATE',
            'SEND_MESSAGE',
          ],
        },
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Erro ao registrar webhook na Evolution API:', data)
      return { success: false, error: data }
    }

    return { success: true, data }
  }

  static async getQRCode(instanceName: string, customUrl?: string, customKey?: string) {
    const { apiUrl, apiKey } = getEvolutionCredentials(customUrl, customKey)

    try {
      const response = await fetch(`${apiUrl}/instance/connect/${instanceName}`, {
        method: 'GET',
        headers: { apikey: apiKey },
      })

      const data = await response.json()

      if (!response.ok) {
        console.error(`[EvolutionApiService] Erro ao obter QR Code (${response.status}):`, data)
        return null
      }

      return this.extractQrFromPayload(data)
    } catch (error) {
      console.error(`[EvolutionApiService] Erro de rede ao obter QR Code para ${instanceName}:`, error)
      return null
    }
  }

  /**
   * Tenta obter QR da resposta do create e, se necessário, via /instance/connect com retry.
   */
  static async resolveQRCode(
    instanceName: string,
    createResponse: unknown,
    customUrl?: string,
    customKey?: string,
    options: { retries?: number; delayMs?: number } = {},
  ): Promise<string | null> {
    const { retries = 3, delayMs = 1500 } = options

    let qr = this.extractQrFromPayload(createResponse)
    if (qr) return qr

    for (let attempt = 0; attempt < retries; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
      qr = await this.getQRCode(instanceName, customUrl, customKey)
      if (qr) return qr
    }

    return null
  }

  static async logoutInstance(instanceName: string, customUrl?: string, customKey?: string) {
    const { apiUrl, apiKey } = getEvolutionCredentials(customUrl, customKey)

    console.log(`[EvolutionApiService] Solicitando exclusão da instância: ${instanceName}`)

    try {
      const response = await fetch(`${apiUrl}/instance/delete/${instanceName}`, {
        method: 'DELETE',
        headers: { apikey: apiKey },
      })

      if (response.ok) {
        console.log(
          `[EvolutionApiService] Instância ${instanceName} removida com sucesso do provedor.`,
        )
      } else {
        const data = await response.json().catch(() => ({}))
        console.warn(
          `[EvolutionApiService] Resposta do provedor ao deletar (status ${response.status}):`,
          data,
        )
      }
    } catch (e) {
      console.error('[EvolutionApiService] Erro de rede ao tentar deletar instância:', e)
    }
  }

  static async getConnectionStatus(
    instanceName: string,
    customUrl?: string,
    customKey?: string,
  ) {
    const { apiUrl, apiKey } = getEvolutionCredentials(customUrl, customKey)

    const response = await fetch(`${apiUrl}/instance/connectionState/${instanceName}`, {
      method: 'GET',
      headers: { apikey: apiKey },
    })

    if (!response.ok) return 'disconnected'

    const data = await response.json()
    return data.instance.state
  }

  /** Expõe config do ambiente atual (útil em logs e rotas API). */
  static getEnvironmentConfig() {
    return getOmnichannelConfig()
  }
}

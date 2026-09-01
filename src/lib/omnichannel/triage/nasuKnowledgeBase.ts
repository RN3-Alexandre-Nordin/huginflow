/**
 * Conteúdo da Base de Conhecimento — horário e mapa de triagem NASU.
 */
export const NASU_KB_HORARIO = `Horário de atendimento humano NASU Locações (WhatsApp e canais):
- Dias: segunda a sexta-feira
- Horário: 08:00 às 17:00
- Fuso: America/Sao_Paulo (horário de Brasília)
- Sábados, domingos e fora desse intervalo: NÃO há atendente humano imediato.
- A IA DEVE continuar a conversa fora do horário até classificar a solicitação e permitir a criação do card.
- Só após registrar/classificar, informe o cliente sobre o retorno no horário comercial.
- Mensagem sugerida (após criar o card, fora do horário): "Registramos sua solicitação. Nosso horário de atendimento humano é de segunda a sexta, das 8h às 17h (horário de Brasília). Um de nossos atendentes entrará em contato nesse período. Obrigado!"
`

export const NASU_KB_DOCUMENTOS = `Documentos via WhatsApp (PDF, foto, PIX, boleto, comprovante):
- financeiro_pagamento: PIX, comprovante de transferência ou pagamento → Financeiro.
- financeiro_boleto: boleto bancário → Financeiro.
- financeiro_recibo: recibo → Financeiro.
- financeiro_documento: NF, cobrança, PDF financeiro → Financeiro.
- expedicao_comprovante: comprovante de entrega, logística → Expedição.
- documento_nao_identificado: ilegível ou incerto → inferir funil pela conversa/KB; observação de leitura manual.
Anexo automático só quando já existir card aberto do cliente com a MESMA categoria.
`

export const NASU_KB_TRIAGEM = `Mapa de triagem NASU (assuntos → departamento → funil):
- Orçamentos, locação de equipamentos, condições comerciais, novos clientes → departamento Comercial → funil Atendimento.
- Entrega, retirada, OS de expedição, comprovante de entrega, logística de equipamentos → departamento Expedição → funil Expedição.
- Boletos, notas fiscais, cobrança, pagamentos, contratos financeiros → departamento Financeiro → funil Financeiro.
- Assunto ambíguo: perguntar se é comercial, expedição ou financeiro antes de criar card.
- Um card por solicitação principal; registrar no resumo dados informados (contrato, endereço, equipamento, etc.).
`

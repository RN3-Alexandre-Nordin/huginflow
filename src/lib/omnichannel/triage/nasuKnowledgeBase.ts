/**
 * Conteúdo da Base de Conhecimento — horário e mapa de triagem NASU.
 */
export const NASU_KB_HORARIO = `Horário de atendimento NASU Locações (WhatsApp e canais):
- Dias: segunda a sexta-feira
- Horário: 08:00 às 17:00
- Fuso: America/Sao_Paulo (horário de Brasília)
- Sábados, domingos e fora desse intervalo: NÃO há atendimento humano imediato, salvo plantão autorizado explicitamente em outra regra da Base de Conhecimento.
- Mensagem sugerida fora do horário: "Olá! Recebemos sua mensagem. Nosso horário de atendimento é de segunda a sexta-feira, das 8h às 17h (horário de Brasília). Um de nossos atendentes entrará em contato no horário comercial. Obrigado!"
`

export const NASU_KB_TRIAGEM = `Mapa de triagem NASU (assuntos → departamento → funil):
- Orçamentos, locação de equipamentos, condições comerciais, novos clientes → departamento Comercial → funil Atendimento.
- Entrega, retirada, OS de expedição, comprovante de entrega, logística de equipamentos → departamento Expedição → funil Expedição.
- Boletos, notas fiscais, cobrança, pagamentos, contratos financeiros → departamento Financeiro → funil Financeiro.
- Assunto ambíguo: perguntar se é comercial, expedição ou financeiro antes de criar card.
- Um card por solicitação principal; registrar no resumo dados informados (contrato, endereço, equipamento, etc.).
`

export type DeletePipelineResult = {
  success?: boolean
  error?: string
  action?: 'deleted' | 'inactivated'
  cardsCount?: number
  message?: string
}

/** Reescreve caminhos relativos de imagens/vídeos do HTML de ajuda para as rotas da API. */
export function prepareHelpHtml(raw: string) {
  return raw
    .replace(/src="manual\/img\//g, 'src="/api/ajuda/img/')
    .replace(/src="manual\/videos\//g, 'src="/api/ajuda/img/videos/')
}

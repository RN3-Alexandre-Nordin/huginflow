import { resolve } from 'node:path'

export function testRunsRoot() {
  return resolve(process.cwd(), 'docs/homologacao/execucoes')
}

export function runDir(runId: string) {
  return resolve(testRunsRoot(), runId)
}

export function runEventsPath(runId: string) {
  return resolve(runDir(runId), 'events.ndjson')
}

export function runReportPath(runId: string) {
  return resolve(runDir(runId), 'report.html')
}

export function runSummaryPath(runId: string) {
  return resolve(runDir(runId), 'summary.json')
}

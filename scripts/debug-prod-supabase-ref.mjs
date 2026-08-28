const base = process.argv[2] || 'https://app.huginflow.com'
const html = await (await fetch(`${base}/login`)).text()
const chunks = [...html.matchAll(/\/_next\/static\/chunks\/[^"']+\.js/g)].map((m) => m[0])
const refs = new Set()
for (const chunk of chunks) {
  const js = await (await fetch(`${base}${chunk}`)).text()
  for (const m of js.matchAll(/https:\/\/[a-z0-9]+\.supabase\.co/g)) refs.add(m[0])
}
console.log('host:', base)
console.log('chunks scanned:', chunks.length)
console.log('supabase refs in client bundle:', [...refs])

// Test login via server - health summary doesn't show ref
const health = await (await fetch(`${base}/api/health/omnichannel`)).json()
console.log('health env:', health.environment, 'supabaseConfigured:', health.supabaseUrlConfigured)

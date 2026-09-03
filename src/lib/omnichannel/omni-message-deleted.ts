export function asOmniMeta(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {}
}

export function isOmniMessageDeleted(metadata: unknown): boolean {
  const meta = asOmniMeta(metadata)
  return meta.deleted === true || meta.whatsapp_deleted === true || meta.status === 'deleted'
}

export function markOmniMetadataDeleted(
  metadata: unknown,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...asOmniMeta(metadata),
    ...extra,
    deleted: true,
    whatsapp_deleted: extra?.whatsapp_deleted !== false,
    status: 'deleted',
  }
}

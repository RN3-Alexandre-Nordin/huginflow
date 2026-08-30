const TIME_ZONE = 'America/Sao_Paulo'

export type BusinessHoursConfig = {
  /** 0=Dom … 6=Sáb — dias úteis padrão seg–sex */
  weekdays: number[]
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
  timeZone: string
}

export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig = {
  weekdays: [1, 2, 3, 4, 5],
  startHour: 8,
  startMinute: 0,
  endHour: 17,
  endMinute: 0,
  timeZone: TIME_ZONE,
}

type ZonedParts = {
  weekday: number
  hour: number
  minute: number
  isoLocal: string
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]))
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  const weekday = weekdayMap[parts.weekday ?? ''] ?? date.getUTCDay()
  const hour = Number(parts.hour ?? 0)
  const minute = Number(parts.minute ?? 0)
  const isoLocal = `${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
  return { weekday, hour, minute, isoLocal }
}

export function isWithinBusinessHours(
  now: Date = new Date(),
  config: BusinessHoursConfig = DEFAULT_BUSINESS_HOURS,
): { dentroHorario: boolean; agoraIsoLocal: string; timeZone: string } {
  const zoned = getZonedParts(now, config.timeZone)
  const minutes = zoned.hour * 60 + zoned.minute
  const start = config.startHour * 60 + config.startMinute
  const end = config.endHour * 60 + config.endMinute
  const isWeekday = config.weekdays.includes(zoned.weekday)
  const dentroHorario = isWeekday && minutes >= start && minutes < end

  return {
    dentroHorario,
    agoraIsoLocal: `${zoned.isoLocal} (${config.timeZone})`,
    timeZone: config.timeZone,
  }
}

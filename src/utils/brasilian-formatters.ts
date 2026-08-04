/**
 * Brazilian Specific Formatters and Validators (HuginFlow)
 */

/**
 * Removes all non-digit characters from a string.
 */
export const cleanDigits = (value: string): string => {
  return value.replace(/\D/g, '')
}

/**
 * Applies CNPJ mask: 00.000.000/0001-00
 */
export const maskCNPJ = (value: string): string => {
  const digits = cleanDigits(value).slice(0, 14)
  if (digits.length <= 2) return digits
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

/**
 * Applies Phone mask: (00) 00000-0000 or (00) 0000-0000
 */
export const maskPhone = (value: string): string => {
  const digits = cleanDigits(value).slice(0, 11)
  if (digits.length <= 2) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

/**
 * Official CNPJ validation algorithm.
 */
export const validateCNPJ = (cnpj: string): boolean => {
  const digits = cleanDigits(cnpj)
  if (digits.length !== 14) return false

  // Reject known invalid patterns
  if (/^(\d)\1+$/.test(digits)) return false

  const calc = (s: string, n: number) => {
    let sum = 0
    let weight = n - 7
    for (let i = s.length; i >= 1; i--) {
      sum += parseInt(s.charAt(s.length - i)) * weight--
      if (weight < 2) weight = 9
    }
    const res = sum % 11
    return res < 2 ? 0 : 11 - res
  }

  const s = digits.substring(0, 12)
  const digit1 = calc(s, 12)
  const digit2 = calc(s + digit1, 13)

  return digits.substring(12) === `${digit1}${digit2}`
}

/**
 * Applies CPF mask: 000.000.000-00
 */
export const maskCPF = (value: string): string => {
  const digits = cleanDigits(value).slice(0, 11)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

/**
 * Official CPF validation algorithm.
 */
export const validateCPF = (cpf: string): boolean => {
  const digits = cleanDigits(cpf)
  if (digits.length !== 11) return false
  if (/^(\d)\1+$/.test(digits)) return false

  const calc = (slice: string, factor: number) => {
    let sum = 0
    for (let i = 0; i < slice.length; i++) {
      sum += parseInt(slice.charAt(i), 10) * (factor - i)
    }
    const mod = (sum * 10) % 11
    return mod === 10 ? 0 : mod
  }

  const d1 = calc(digits.substring(0, 9), 10)
  const d2 = calc(digits.substring(0, 10), 11)
  return digits.endsWith(`${d1}${d2}`)
}

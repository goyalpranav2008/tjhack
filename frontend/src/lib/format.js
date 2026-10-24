const nf = new Intl.NumberFormat("en-IN")

export const inr = (n) => `\u20B9${nf.format(Math.round(n))}`
export const num = (n) => nf.format(Math.round(n))
export const pct = (n) => `${Math.round(n * 100)}%`

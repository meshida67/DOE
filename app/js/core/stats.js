/**
 * stats.js — distribuições F e t, para p-valores da ANOVA e dos coeficientes.
 *
 * Sem tabelas impressas e sem toolbox: tudo sai da função beta incompleta
 * regularizada, calculada por fração continuada (Numerical Recipes, §6.4).
 */

/** ln Γ(x) pela aproximação de Lanczos (g = 7, 9 coeficientes). */
export function logGamma(x) {
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7 + 0.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Fração continuada de Lentz para a beta incompleta. */
function betacf(a, b, x) {
  const MAXIT = 300, EPS = 3e-16, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Beta incompleta regularizada I_x(a, b). */
export function incompleteBeta(a, b, x) {
  if (!(x > 0)) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** P(F ≤ f) para F(d1, d2). */
export function fCDF(f, d1, d2) {
  if (!(f > 0) || !(d1 > 0) || !(d2 > 0)) return 0;
  return incompleteBeta(d1 / 2, d2 / 2, (d1 * f) / (d1 * f + d2));
}

/** p-valor unilateral à direita de F — o usado na ANOVA. */
export function fPValue(f, d1, d2) {
  if (!isFinite(f) || !(f > 0) || !(d1 > 0) || !(d2 > 0)) return NaN;
  return 1 - fCDF(f, d1, d2);
}

/** p-valor bilateral da t de Student. */
export function tPValue(t, df) {
  if (!isFinite(t) || !(df > 0)) return NaN;
  return incompleteBeta(df / 2, 0.5, df / (df + t * t));
}

/** P(T ≤ t) para t de Student com df graus de liberdade. */
export function tCDF(t, df) {
  const p = incompleteBeta(df / 2, 0.5, df / (df + t * t)) / 2;
  return t >= 0 ? 1 - p : p;
}

/**
 * Quantil da t de Student por bisseção sobre a CDF.
 * Precisão suficiente para intervalos de confiança (~1e-10).
 */
export function tInv(p, df) {
  if (!(df > 0) || !(p > 0) || !(p < 1)) return NaN;
  let lo = -1e3, hi = 1e3;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tCDF(mid, df) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** t crítico bilateral para nível de confiança `conf` (ex.: 0.95). */
export function tCritical(conf, df) {
  return tInv(1 - (1 - conf) / 2, df);
}

export const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

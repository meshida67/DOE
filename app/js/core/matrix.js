/**
 * matrix.js — álgebra linear mínima, sem dependências.
 *
 * Só o necessário para DOE: resolver mínimos quadrados de forma estável,
 * inverter (X'X) para obter erros-padrão dos coeficientes e diagonalizar a
 * matriz de coeficientes quadráticos (análise canônica da superfície).
 *
 * Nenhuma função aqui toca no DOM — o mesmo arquivo roda no navegador e no
 * Node (harness de validação contra o MATLAB).
 */

export function zeros(n, m) {
  return Array.from({ length: n }, () => new Array(m).fill(0));
}

export function identity(n) {
  const I = zeros(n, n);
  for (let i = 0; i < n; i++) I[i][i] = 1;
  return I;
}

export function transpose(A) {
  const n = A.length, m = A[0].length;
  const T = zeros(m, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) T[j][i] = A[i][j];
  return T;
}

export function matmul(A, B) {
  const n = A.length, k = B.length, m = B[0].length;
  const C = zeros(n, m);
  for (let i = 0; i < n; i++) {
    for (let t = 0; t < k; t++) {
      const a = A[i][t];
      if (a === 0) continue;
      for (let j = 0; j < m; j++) C[i][j] += a * B[t][j];
    }
  }
  return C;
}

export function matvec(A, v) {
  return A.map((row) => row.reduce((s, a, j) => s + a * v[j], 0));
}

/**
 * Decomposição QR por reflexões de Householder, aplicada simultaneamente a
 * `b`. Devolve R (n×p, triangular superior nas p primeiras linhas) e Q'b.
 *
 * Preferimos Householder às equações normais (X'X)\(X'y) porque o número de
 * condição de X'X é o quadrado do de X. Em coordenadas codificadas o
 * planejamento é bem-condicionado por construção e a diferença é pequena, mas
 * o custo de fazer certo é desprezível e o código passa a tolerar
 * planejamentos mal escolhidos pelo usuário.
 */
export function householderQR(A, b) {
  const n = A.length, p = A[0].length;
  const R = A.map((r) => r.slice());
  const qtb = b.slice();

  for (let k = 0; k < p; k++) {
    let norm = 0;
    for (let i = k; i < n; i++) norm += R[i][k] * R[i][k];
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    // Sinal escolhido para evitar cancelamento catastrófico em v[k].
    if (R[k][k] > 0) norm = -norm;

    const v = new Array(n).fill(0);
    for (let i = k; i < n; i++) v[i] = R[i][k];
    v[k] -= norm;

    let vv = 0;
    for (let i = k; i < n; i++) vv += v[i] * v[i];
    if (vv === 0) continue;

    for (let j = k; j < p; j++) {
      let s = 0;
      for (let i = k; i < n; i++) s += v[i] * R[i][j];
      s = (2 * s) / vv;
      for (let i = k; i < n; i++) R[i][j] -= s * v[i];
    }
    let s = 0;
    for (let i = k; i < n; i++) s += v[i] * qtb[i];
    s = (2 * s) / vv;
    for (let i = k; i < n; i++) qtb[i] -= s * v[i];
  }
  return { R, qtb };
}

/** Substituição retroativa em sistema triangular superior p×p. */
export function backSolve(R, y, p) {
  const x = new Array(p).fill(0);
  for (let i = p - 1; i >= 0; i--) {
    let s = y[i];
    for (let j = i + 1; j < p; j++) s -= R[i][j] * x[j];
    if (Math.abs(R[i][i]) < 1e-14) throw new Error('Sistema singular: o planejamento não permite estimar todos os coeficientes do modelo.');
    x[i] = s / R[i][i];
  }
  return x;
}

/** Inverte uma triangular superior p×p. */
export function invertUpper(R, p) {
  const Inv = zeros(p, p);
  for (let i = p - 1; i >= 0; i--) {
    if (Math.abs(R[i][i]) < 1e-14) throw new Error('Matriz singular ao inverter R.');
    Inv[i][i] = 1 / R[i][i];
    for (let j = i + 1; j < p; j++) {
      let s = 0;
      for (let k = i + 1; k <= j; k++) s += R[i][k] * Inv[k][j];
      Inv[i][j] = -s / R[i][i];
    }
  }
  return Inv;
}

/**
 * Mínimos quadrados ordinários: resolve min ||X b − y||.
 * Devolve também (X'X)^{-1}, necessária para os erros-padrão.
 */
export function lstsq(X, y) {
  const p = X[0].length;
  const { R, qtb } = householderQR(X, y);
  const beta = backSolve(R, qtb, p);
  const Rinv = invertUpper(R, p);
  // (X'X)^{-1} = R^{-1} R^{-T}
  const XtXinv = zeros(p, p);
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let s = 0;
      for (let k = 0; k < p; k++) s += Rinv[i][k] * Rinv[j][k];
      XtXinv[i][j] = s;
    }
  }
  return { beta, XtXinv, R };
}

/** Eliminação gaussiana com pivotamento parcial. Resolve A x = b. */
export function solveLinear(Ain, bin) {
  const n = Ain.length;
  const A = Ain.map((r) => r.slice());
  const b = bin.slice();
  for (let k = 0; k < n; k++) {
    let piv = k;
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[piv][k])) piv = i;
    if (Math.abs(A[piv][k]) < 1e-14) return null; // singular
    if (piv !== k) { [A[k], A[piv]] = [A[piv], A[k]]; [b[k], b[piv]] = [b[piv], b[k]]; }
    for (let i = k + 1; i < n; i++) {
      const f = A[i][k] / A[k][k];
      if (f === 0) continue;
      for (let j = k; j < n; j++) A[i][j] -= f * A[k][j];
      b[i] -= f * b[k];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  return x;
}

/**
 * Autovalores/autovetores de matriz simétrica pelo método cíclico de Jacobi.
 * Usado na análise canônica: o sinal dos autovalores diz se o ponto
 * estacionário é máximo, mínimo ou sela.
 *
 * Devolve autovalores em ordem decrescente, com autovetores nas colunas.
 */
export function jacobiEigen(Ain, maxSweeps = 100, tol = 1e-14) {
  const n = Ain.length;
  const A = Ain.map((r) => r.slice());
  let V = identity(n);

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (Math.sqrt(2 * off) < tol) break;

    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(A[p][q]) < 1e-300) continue;
        const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
        const sign = theta >= 0 ? 1 : -1;
        const t = sign / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;

        for (let k = 0; k < n; k++) {
          const akp = A[k][p], akq = A[k][q];
          A[k][p] = c * akp - s * akq;
          A[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p][k], aqk = A[q][k];
          A[p][k] = c * apk - s * aqk;
          A[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k][p], vkq = V[k][q];
          V[k][p] = c * vkp - s * vkq;
          V[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }

  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => A[b][b] - A[a][a]);
  const values = idx.map((i) => A[i][i]);
  const vectors = zeros(n, n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) vectors[r][c] = V[r][idx[c]];
  return { values, vectors };
}

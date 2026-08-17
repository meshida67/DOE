# O MATLAB neste projeto

O MATLAB **não** é a camada de entrega — os grupos usam o site. Ele continua no
projeto em dois papéis:

1. **Referência matemática.** `validacao/gerar_casos.m` recalcula, de forma
   independente, todos os valores dos casos de teste. O runner em JavaScript
   confere a implementação entregue contra esses valores. É validação cruzada de
   verdade: duas implementações escritas de formas diferentes precisam concordar.
2. **Registro histórico.** Os protótipos da semana 1 ficam onde estão.

## Validação cruzada

No MATLAB, com esta pasta como diretório de trabalho:

```matlab
cd matlab/validacao
gerar_casos
```

Isso lê `tests/casos-referencia.json` (as definições dos casos: fatores,
configuração e resultados), refaz toda a matemática em MATLAB e grava
`tests/casos-matlab.json`. Depois, na raiz do projeto:

```bash
node tests/validar.mjs tests/casos-matlab.json
```

Se passar, o JavaScript concorda com o MATLAB dentro da tolerância.

O script usa só MATLAB base — `jsondecode`/`jsonencode` (R2016b+), `\` para
mínimos quadrados e `eig` para a análise canônica. Nenhuma toolbox.

### O que é comparado

Coeficientes do modelo, somas quadráticas e graus de liberdade (incluindo erro
puro e falta de ajuste), R², ponto estacionário em coordenadas codificadas e
reais, autovalores da matriz B, classificação da superfície, ótimo restrito e
distância axial α.

### Convenções que os dois lados precisam respeitar

- **Ordem padrão dos ensaios**: bloco fatorial 2^k em ordem de Yates (o fator 1
  alterna a cada linha), depois o bloco axial (para cada fator, −α e depois +α),
  depois as repetições centrais. Os resultados no campo `y` seguem essa ordem.
- **Ordem dos coeficientes**: intercepto, lineares (b1…bk), quadráticos
  (b11…bkk), interações (b12, b13, …, b(k−1)k).
- **Codificação**: modo de limites absolutos — a coordenada mais extrema do
  planejamento cai exatamente sobre o limite informado, isto é,
  `unidade = (max − min)/2 / max(α, 1)`.

## Protótipos originais (semana 1)

`design1.m`, `Variavel.m`, `anovatab.m`, `latextab.m`, `design3.py`.

Três observações sobre eles, para quem for consultá-los:

1. **`design1.m` não roda como está.** Ele chama `modelo(x1, x2, b)` nas linhas
   82, 106, 113 e 121, e essa função não está no repositório — provavelmente
   ficou no `teste.m` removido no commit `087fa1a`.
2. **Erro de escala na linha 121.** Nas linhas 119–120 `x1` e `x2` passam para
   unidades físicas, e na linha seguinte são entregues a `modelo()`, que espera
   coordenadas codificadas. A resposta prevista no ótimo sai errada sempre que
   os limites não forem [−1, 1]. O correto seria `modelo(x(1), x(2), b)`.
3. **O ponto estacionário não é verificado.** A matriz `[2b₄, b₆; b₆, 2b₅]` pode
   ser indefinida, e nesse caso o ponto encontrado é uma **sela** reportada como
   máximo. A implementação atual resolve isso com análise canônica
   (`app/js/core/optimize.js`), e há um caso de teste dedicado a esse cenário.

Menores: em `anovatab.m` o parâmetro `'VariableNames'` aparece duas vezes na
mesma chamada de `table`; e em `design1.m` linha 81, `b = X\Y` seria preferível
a `(X'*X)\(X'*Y)` — resolve por QR o que estava sendo resolvido pelas equações
normais.

A geração de LaTeX de `latextab.m` e `anovatab.m` foi reimplementada em
`app/js/io/latex.js`, mantendo o mesmo formato booktabs, e agora sai direto do
botão "Tabelas em LaTeX" na tela de resultados.

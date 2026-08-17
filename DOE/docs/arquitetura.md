# Arquitetura

Documento de referência para quem for mexer no código. Descreve as camadas, o
que cada módulo expõe e por onde os dados passam.

## Princípio de separação

Três camadas, com uma regra que vale a pena respeitar:

| Camada | Pastas | Regra |
|---|---|---|
| **Núcleo** | `app/js/core/` | Matemática pura. **Não pode tocar no DOM**, não conhece Excel, não conhece HTML. Roda igual no navegador e no Node. |
| **Entrada/saída** | `app/js/io/` | Traduz entre o núcleo e o mundo (planilhas, LaTeX). Conhece o núcleo; não conhece a interface. |
| **Interface** | `app/js/ui/`, `main.js` | Telas, gráficos, eventos. Conhece as duas camadas de baixo. |

A regra do núcleo é o que permite que `tests/validar.mjs` rode a mesma
matemática que o usuário executa, sem navegador e sem simulação de DOM. Se
algum dia alguém quiser uma versão de linha de comando, ela já existe: é
importar `pipeline.js`.

## Fluxo dos dados

```
                    ┌──────────────────────┐
  modelo.xlsx  ───► │ io/excel.js          │
  (preenchido)      │  lerModeloPreenchido │
                    └──────────┬───────────┘
                               │ spec
                               ▼
                    ┌──────────────────────┐
                    │ core/pipeline.js     │
                    │  criarPlanejamento   │
                    └──────────┬───────────┘
                               │ { meta, ensaios, diagnostico }
                    ┌──────────┴───────────┐
                    ▼                      ▼
        ┌──────────────────────┐   ┌──────────────┐
        │ io/excel.js          │   │ ui/views.js  │
        │  gerarPlanilhaEnsaios│   │  telaPlano   │
        └──────────┬───────────┘   └──────────────┘
                   │ ensaios-<nome>.xlsx
                   │        (o grupo faz os experimentos
                   │         e preenche a coluna de resultado)
                   ▼
        ┌──────────────────────┐
        │ io/excel.js          │
        │ lerEnsaiosPreenchidos│  ← recupera `meta` da aba _DOE
        └──────────┬───────────┘
                   │ { meta, ensaios com resposta }
                   ▼
        ┌──────────────────────┐
        │ core/pipeline.js     │
        │  analisarResultados  │
        └──────────┬───────────┘
                   │ analise
        ┌──────────┼──────────────┬──────────────┐
        ▼          ▼              ▼              ▼
  gerarPlanilha  ui/plot.js   io/latex.js   ui/views.js
  Resultados     (4 gráficos)  (tabelas)    telaAnalise
```

## Os dois objetos que atravessam tudo

### `spec` — o que o usuário quer

```js
{
  experimento: { nome, grupo, responsavel, data, observacoes },
  resposta:    { nome, unidade, objetivo: 'maximizar'|'minimizar'|'alvo', alvo? },
  fatores:     [ { nome, unidade, min, max, casasDecimais? } ],   // 2 a 4
  config:      { tipoAlpha, pontosCentrais, limitMode, aleatorizar, confianca }
}
```

### `meta` — o planejamento congelado

É o `spec` depois de resolvido: com `alpha` calculado, os fatores enriquecidos
com `centro` e `unidadeCodificada`, e a semente do sorteio. **É o que viaja na
aba `_DOE`** e o que permite analisar os resultados semanas depois sem perguntar
nada de novo ao usuário.

## Módulos do núcleo

### `core/matrix.js`
`zeros` · `identity` · `transpose` · `matmul` · `matvec` · `householderQR` ·
`backSolve` · `invertUpper` · **`lstsq(X, y)`** · `solveLinear` ·
**`jacobiEigen(A)`**

`lstsq` resolve por QR de Householder em vez das equações normais: o número de
condição de `X'X` é o quadrado do de `X`. Em coordenadas codificadas o
planejamento é bem-condicionado e a diferença seria pequena, mas o custo de
fazer certo é desprezível. Devolve também `(X'X)⁻¹`, necessária para os
erros-padrão.

`jacobiEigen` é o método cíclico de Jacobi para matrizes simétricas — é o que
sustenta a análise canônica.

### `core/stats.js`
`logGamma` · `incompleteBeta` · `fCDF` · **`fPValue`** · **`tPValue`** ·
`tCDF` · `tInv` · `tCritical`

Tudo sai da beta incompleta regularizada por fração continuada. Sem tabelas
impressas e sem toolbox.

### `core/coding.js`
`extremeCoded` · **`prepararFator`** · `paraReal` · `paraCodificado` ·
`arredondar` · `casasDecimaisSugeridas` · `linhaParaReal` · `linhaParaCodificado`

Aqui mora a decisão de escala. Com `limitMode: 'absoluto'` (padrão),
`unidadeCodificada = (max-min)/2 / max(α,1)`, de modo que a coordenada mais
extrema do planejamento caia exatamente no limite declarado. Com `'fatorial'`,
os limites são os níveis ±1 e os axiais extrapolam.

### `core/design.js`
`sementeDeTexto` · `alphaRotacionavel` · `alphaOrtogonal` · `resolverAlpha` ·
`blocoFatorial` · `blocoAxial` · `blocoCentral` · **`gerarMatrizCCD`** ·
`numeroParametros` · **`diagnosticarPlanejamento`**

A ordem padrão é fatorial 2^k em Yates, depois axial, depois central — e essa
ordem é contrato: os casos de referência e o script MATLAB dependem dela. A
ordem de *execução* é sorteada com PRNG semeado pelo nome do experimento, então
regenerar o mesmo planejamento dá a mesma ordem.

`diagnosticarPlanejamento` roda **antes** dos ensaios e avisa em português
quando faltam graus de liberdade ou repetições — quando ainda dá para corrigir.

### `core/model.js`
**`montarTermos(k)`** · `valorTermo` · `montarX` · `prever` · **`ajustar`** ·
`gradiente` · **`matrizB`** · `vetorLinear` · `erroPadraoPrevisao`

A ordem dos termos é fixa e é o contrato entre o vetor de coeficientes e todo o
resto: **intercepto, lineares, quadráticos, interações**.

`matrizB` monta a matriz `B` tal que a parte quadrática seja `x'Bx`; os termos
cruzados entram divididos por 2 porque `b_ij·x_i·x_j` se reparte entre as
posições `(i,j)` e `(j,i)`. A Hessiana do modelo é `2B`.

### `core/anova.js`
**`anova`** · **`interpretar`** · `formatarP`

Separa o resíduo em **erro puro** (variação entre repetições do mesmo ponto —
ruído que nenhum modelo explica) e **falta de ajuste** (o que sobra). O teste F
entre os dois é a única forma honesta de dizer se o modelo quadrático descreve a
superfície. `interpretar` traduz isso em frases acionáveis, incluindo a
armadilha de que p pequeno é bom na regressão e ruim na falta de ajuste.

### `core/optimize.js`
**`pontoEstacionario`** · **`analiseCanonica`** · **`otimoRestrito`** ·
`caminhoMaximaInclinacao` · **`encontrarOtimo`**

Responde duas perguntas separadamente:

1. **Onde o modelo tem gradiente nulo?** Pode cair fora da região ou ser uma
   sela. O sinal dos autovalores de `B` classifica a superfície.
2. **Qual a melhor condição executável?** Busca em grade sobre a caixa viável
   (grade, e não um método local a partir do centro, porque numa sela o método
   local iria para o ponto errado), seguida de refinamento em janelas que
   encolhem e de um **passo de Newton** — que num quadrático salta direto para o
   estacionário e leva o ótimo interior à precisão da máquina. O passo só é
   aceito se continuar dentro da caixa e melhorar o resultado, o que descarta
   sozinho os casos de sela e de mínimo.

### `core/pipeline.js`
`VERSAO_ESQUEMA` · `CONFIG_PADRAO` · `validarSpec` · **`criarPlanejamento`** ·
**`analisarResultados`** · `preverEmReais`

É a única camada que a interface e o Excel precisam conhecer.

Detalhe importante de `analisarResultados`: as coordenadas codificadas são
**recalculadas a partir dos valores reais informados na planilha**, não das
planejadas. Já a identidade de réplica (para o erro puro) vem do planejado — os
pontos centrais são repetições por construção, mesmo que os valores executados
variem um pouco; agrupar pelo executado quebraria os grupos.

## Módulos de entrada/saída

### `io/schema.js`
`ABAS` · `normalizar` · **`parseNumero`** · `parseObjetivo` · `parseTipoAlpha` ·
**`acharColuna`** · `lerParesRotuloValor` · **`lerSpecDeAbas`** ·
**`lerEnsaiosDeAba`** · `serializarMeta` · `desserializarMeta`

Trabalha sobre matrizes simples (array de arrays), sem conhecer a SheetJS —
assim o formato é testável sem abrir um `.xlsx`, e trocar a biblioteca um dia
não mexe nas regras de leitura.

Toda leitura é deliberadamente tolerante, porque a planilha é preenchida por
gente com pressa: `parseNumero` aceita `"0,5"`, `"1.234,56"` e `"1,234.56"`;
`normalizar` ignora acento e caixa; `acharColuna` casa por igualdade exata,
depois ignorando a unidade entre parênteses, e só então por prefixo — nessa
ordem, para que `Concentração` e `Concentração final` na mesma planilha não
disputem a mesma coluna.

### `io/excel.js`
`gerarModeloEntrada` · **`gerarPlanilhaEnsaios`** · `gerarPlanilhaResultados` ·
`lerArquivo` · **`identificarArquivo`** · `lerModeloPreenchido` ·
`lerEnsaiosPreenchidos` · `baixarLivro` · `nomeArquivo`

`identificarArquivo` decide sozinho o que o usuário enviou (modelo preenchido ou
ensaios com resultados) olhando as abas presentes — o usuário não precisa dizer.

### `io/latex.js`
`escaparLatex` · `tabelaEnsaios` · `tabelaAnova` · `tabelaCoeficientes` ·
`equacaoModelo` · `paragrafoConclusao` · **`gerarLatex`** · `baixarLatex`

Reproduz o formato booktabs que o grupo já usava em `latextab.m` e
`anovatab.m`, para colar direto no `.tex` do relatório.

## Interface

`ui/views.js` gera HTML a partir do estado (funções puras, tudo passando por
`esc`). `ui/plot.js` desenha os quatro gráficos em SVG. `main.js` guarda o
estado e redesenha a tela inteira a cada transição — para um aplicativo deste
tamanho isso é mais fácil de acompanhar do que atualização incremental e
elimina uma classe inteira de bugs de sincronismo.

### Gráficos (`ui/plot.js`)

| Função | Forma | Codificação de cor |
|---|---|---|
| `plotarSuperficie` | mapa de calor + isolinhas (marching squares) | **sequencial**, uma matiz, com legenda numérica |
| `plotarEfeitos` | barras horizontais + barra de incerteza | **divergente** azul/vermelho pelo sinal |
| `plotarObservadoPrevisto` | dispersão + diagonal | série única |
| `plotarResiduos` | dispersão contra a ordem de execução | série única |

As cores vêm de custom properties do CSS, então o tema escuro é uma troca de
variáveis e não um segundo caminho de código. Na rampa sequencial a âncora
inverte no escuro, de modo que "mais contraste com o fundo" signifique "mais
resposta" nos dois temas.

O gráfico de efeitos mostra o intervalo de confiança como uma barra sobre cada
coeficiente: **quem cruza o zero não se distingue do ruído**. É a leitura
geométrica do p-valor, e não exige que o usuário saiba o que é p-valor.

## Linguagem da interface

Regra explícita: nas telas do fluxo principal não aparecem "matriz de
planejamento", "codificado", "α", "matriz X", "mínimos quadrados" nem
"Hessiana". Esses termos existem só na aba **Detalhes técnicos**, que é opcional
e serve para escrever o relatório. As telas falam em "o que você controla",
"o que você vai medir", "repetições do ensaio central" e "até onde posso ir".

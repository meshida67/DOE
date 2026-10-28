# Projeto DOE — Grupo 7, QUI-28 LAB (ITA)

Ferramenta de **planejamento de experimentos** e **otimização por superfície de
resposta** para os grupos da disciplina. O grupo descreve o que quer estudar,
recebe a lista de ensaios a realizar, faz os experimentos, devolve os resultados
e recebe a condição ótima com gráficos e tabelas prontas para o relatório.

**Não é preciso instalar nada.** É um site estático: abre no navegador, todos os
cálculos rodam na máquina do usuário, nenhum dado sai do computador.

```
Grupo X  →  preenche Excel (ou o formulário)
             ↓
         software lê e gera o CCD
             ↓
         Excel com os ensaios a realizar
             ↓
         grupo executa os experimentos e preenche a coluna de resultado
             ↓
         software ajusta o modelo e acha o ótimo
             ↓
         Excel final + gráficos + tabelas em LaTeX
```

## Como rodar

Localmente (o navegador exige um servidor por causa dos módulos ES):

```bash
python3 -m http.server 8000
```

Depois abra <http://localhost:8000>.

Para publicar: **Settings → Pages → Deploy from branch → `main` / `(root)`**.
Não há build, bundler nem dependências a instalar.

## Testes

Não há framework de testes — só Node e os arquivos em `tests/`.

```bash
node tests/smoke.mjs        # núcleo matemático contra casos analíticos
node tests/excel.mjs        # ida e volta das planilhas
node tests/latex-check.mjs  # geração das tabelas LaTeX
node tests/validar.mjs      # confere o JS contra os casos de referência
```

E, para regenerar as planilhas de exemplo em `exemplos/`:

```bash
node tests/fixture-planilha.mjs
```

## Estrutura

```
index.html                  página única
app/
  css/style.css             tokens de cor (claro/escuro) e todo o estilo
  js/
    core/                   matemática pura — não toca no DOM, roda no Node
      matrix.js             QR de Householder, mínimos quadrados, Jacobi
      stats.js              distribuições F e t (beta incompleta)
      coding.js             conversão unidades reais ↔ codificadas
      design.js             geração do CCD e diagnóstico do planejamento
      model.js              modelo quadrático, ajuste, erros-padrão
      anova.js              ANOVA com erro puro e falta de ajuste
      optimize.js           ponto estacionário, análise canônica, ótimo restrito
      pipeline.js           orquestra: spec → plano; plano + y → análise
    io/
      schema.js             contrato das planilhas (leitura tolerante)
      excel.js              leitura/escrita .xlsx via SheetJS
      latex.js              tabelas e equação para o relatório
    ui/
      views.js              HTML de cada tela
      plot.js               gráficos em SVG, sem biblioteca
    main.js                 estado, navegação, eventos
    vendor/xlsx.full.min.js SheetJS 0.20.3 (Apache-2.0)
matlab/
  validacao/gerar_casos.m   recalcula os casos de referência em MATLAB
  design1.m, anovatab.m…    protótipos originais (ver matlab/README.md)
tests/                      suítes e casos de referência
exemplos/                   planilhas de exemplo
docs/                       arquitetura e formato do Excel
```

Documentação detalhada:

- [docs/arquitetura.md](docs/arquitetura.md) — módulos, funções e o caminho dos dados
- [docs/formato-excel.md](docs/formato-excel.md) — as três planilhas, aba por aba
- [matlab/README.md](matlab/README.md) — o papel do MATLAB no projeto

## O que a ferramenta faz de matemática

- **Planejamento composto central** para 2 a 4 fatores, com α face-centrado
  (padrão), rotacionável ou ortogonal, repetições no ponto central e ordem de
  execução sorteada de forma reprodutível.
- **Ajuste do modelo quadrático completo** por mínimos quadrados via QR de
  Householder, com erro-padrão, estatística t, p-valor e intervalo de confiança
  de cada coeficiente.
- **ANOVA** com decomposição do resíduo em **erro puro** e **falta de ajuste**
  quando existem repetições — que é o que permite responder "o modelo está bom?"
  em vez de só olhar o R².
- **Análise canônica**: diagonaliza a matriz de coeficientes quadráticos e
  classifica a superfície como máximo, mínimo, sela ou cume. Uma sela reportada
  como máximo é o erro clássico em otimização por superfície de resposta, e a
  ferramenta o evita explicitamente.
- **Ótimo restrito** à região que o grupo declarou conseguir executar, por busca
  em grade com polimento de Newton, mais **caminho de máxima inclinação** quando
  o ótimo cai na fronteira e vale a pena uma nova rodada.

## Decisões de projeto que valem saber

**Por que JavaScript e não MATLAB compilado.** O usuário final é um colega de
química com o caderno de laboratório aberto. Distribuir um `.exe` exigiria o
MATLAB Runtime (vários GB, instalação como administrador, versão casada com a
do compilador) e um build por sistema operacional. Um link resolve o mesmo
problema, funciona no celular dentro do laboratório e sobrevive ao semestre.

**O MATLAB continua sendo a referência matemática.** Ele não sai do projeto: em
`matlab/validacao/gerar_casos.m` está o script que recalcula todos os casos de
teste e grava um arquivo que `tests/validar.mjs` confere contra o JavaScript.
É validação cruzada de verdade, e rende parágrafo de relatório.

**Os limites informados são intransponíveis por padrão.** Um CCD tem pontos
axiais a ±α; com α > 1 eles cairiam fora da faixa declarada. A ferramenta
escala a codificação para que o ponto mais extremo caia *exatamente* sobre o
limite informado, de modo que nenhum ensaio peça algo que o grupo disse não
conseguir fazer. Quem quiser explorar além pode habilitar isso explicitamente.

**A planilha de ensaios é também a planilha de entrada dos resultados.** Um
formato a menos, e o grupo não tem como devolver as colunas fora de ordem — o
arquivo já vem pronto, só falta preencher uma coluna. Os metadados do
planejamento viajam junto, numa aba `_DOE`.

**Se o grupo não conseguiu usar o valor exato, ele corrige na planilha.** A
análise recalcula as coordenadas a partir dos valores realmente executados, e
não dos planejados. 45,2 °C onde o plano pedia 45,0 °C entra na conta certa.

## Colaboradores

Caio Schaden Ishida · Cauã Henrique de Souza · Felipe Osternes da Silva ·
Henrique Sousa Fagundes · João Victor Evers Cordeiro ·
José Hernando Figueiredo da Silva Filho

Método de referência: Barros Neto, Scarminio & Bruns, *Como Fazer Experimentos*.

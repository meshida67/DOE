# Formato das planilhas

São **três** arquivos, e o segundo faz papel duplo.

| # | Arquivo | Quem preenche | Para quê |
|---|---|---|---|
| 1 | `modelo-experimento-doe.xlsx` | o grupo | descrever o experimento |
| 2 | `ensaios-<experimento>.xlsx` | o programa gera, o grupo completa | **os ensaios a fazer e, depois, os resultados** |
| 3 | `resultados-<experimento>.xlsx` | o programa | a análise final |

## Por que o arquivo 2 é o mesmo na ida e na volta

A alternativa seria um quarto formato só para o grupo devolver os resultados.
Reaproveitar o arquivo de ensaios elimina esse formato e, com ele, a
possibilidade de o grupo mandar as colunas fora de ordem, com nomes trocados ou
com ensaios faltando: **a planilha já vem pronta, só falta uma coluna**.

Para isso funcionar, o planejamento inteiro viaja junto numa aba chamada
`_DOE`. É ela que permite analisar os resultados semanas depois sem perguntar
nada de novo. Se o grupo copiar as colunas para uma planilha nova, essa aba se
perde e o programa avisa explicitamente o que aconteceu e o que fazer.

---

## 1. Modelo de entrada

Quatro abas. As três primeiras vêm com um exemplo já preenchido, porque um
formulário em branco é sempre mais difícil de preencher do que um preenchido
para outra coisa.

### Aba `Instruções`
Texto corrido, sem nada a preencher. Explica em ~20 linhas o que fazer.

### Aba `Experimento`
Pares rótulo/valor. **A coluna B é a única lida**; a coluna C é ajuda.

| A (Campo) | B (Preencha aqui) | C (Ajuda) |
|---|---|---|
| Nome do experimento | Otimização da síntese X | Um nome curto |
| Grupo | | Número do seu grupo |
| Responsável | | Quem preencheu |
| Data | | |
| O que será medido | Rendimento | A grandeza a otimizar |
| Unidade da resposta | % | Ex.: %, g, mol/L, min |
| Objetivo | maximizar | maximizar, minimizar ou alvo |
| Valor alvo | | Só se o objetivo for "alvo" |
| Observações | | Livre |

Os rótulos são casados por texto normalizado (sem acento, sem caixa), então
inserir uma linha no meio ou trocar "Responsável" por "responsavel" não quebra.

### Aba `Fatores`

| Fator | Unidade | Valor mínimo | Valor máximo | Casas decimais |
|---|---|---|---|---|
| Temperatura | °C | 40 | 60 | 1 |
| Concentração | mol/L | 0,1 | 0,5 | 2 |

De 2 a 4 linhas. **"Casas decimais" é opcional** — é quantas casas o grupo
consegue de fato ajustar no laboratório, e serve para a ferramenta não pedir
"43,7283 °C". Em branco, ela escolhe um valor razoável pela amplitude.

A tabela termina na primeira linha que tem texto mas nenhum número — é onde
começam as notas de rodapé. Linhas totalmente vazias são puladas, então deixar
um espaço entre fatores não faz perder os de baixo.

### Aba `Opções (avançado)`
Já vem nos valores recomendados. Quem não sabe o que é, não mexe.

| Opção | Valor | Efeito |
|---|---|---|
| Repetições no ponto central | 3 | Menos que 3 impede o teste de falta de ajuste |
| Tipo de planejamento | face | `face`, `rotacionavel` ou `ortogonal` |
| Permitir ultrapassar os limites | não | `sim` deixa os pontos axiais saírem da faixa |

---

## 2. Planilha de ensaios (ida e volta)

### Aba `Ensaios` — a que importa

| Ordem | Ensaio | Temperatura (°C) | Concentração (mol/L) | Rendimento (%) | Observações |
|---|---|---|---|---|---|
| 1 | E06 | 60,0 | 0,30 | | |
| 2 | E11 | 50,0 | 0,30 | | |
| 3 | E02 | 60,0 | 0,10 | | |
| … | | | | | |

- Ordenada por **Ordem** — a ordem de execução sorteada, não a ordem lógica.
- A coluna da resposta vem **vazia**: é a única que o grupo preenche.
- O cabeçalho traz o nome do fator com a unidade entre parênteses; a leitura
  ignora a parte entre parênteses ao casar as colunas.

Três coisas que o grupo pode fazer e a ferramenta entende:

1. **Deixar um resultado em branco** — o ensaio é ignorado na análise, com aviso.
2. **Corrigir o valor de um fator** — se usou 45,2 °C onde o plano pedia 45,0,
   basta corrigir na planilha; a análise usa o que foi realmente feito.
3. **Anotar qualquer coisa em Observações** — a coluna não é lida.

### Aba `Instruções`
O que fazer agora, incluindo por que a ordem está embaralhada e por que os
ensaios repetidos não devem ser pulados.

### Aba `Planejamento`
Resumo legível: fatores, faixas, composição dos ensaios (quantos nos vértices,
nos eixos, no centro), número de coeficientes a estimar e quantos ensaios sobram
para verificar o modelo. Mais os avisos do diagnóstico, se houver.

### Aba `_DOE`
JSON dos metadados, fatiado em blocos de 20 000 caracteres (o limite do Excel é
32 767 por célula). Primeira linha: um aviso em português para não editar.

---

## 3. Planilha de resultados

Sete abas, da conclusão para o detalhe.

| Aba | Conteúdo |
|---|---|
| `Resumo` | A resposta, em português: condição recomendada, valor previsto, margem, o que os dados dizem, pontos de atenção |
| `Condição ótima` | Valores recomendados, comparação com o melhor ensaio realizado, classificação da superfície, ponto estacionário e — se o ótimo estiver na borda — o caminho sugerido para a próxima rodada |
| `Ensaios` | Cada ensaio com medido, previsto e diferença |
| `Modelo` | Coeficientes com erro padrão, p-valor e uma coluna "Importante?" em vez de asteriscos |
| `ANOVA` | Tabela completa, com falta de ajuste e erro puro, mais um bloco "Como ler" |
| `Diagnóstico` | Veredito geral e os cinco ensaios com maior desvio (candidatos a erro de execução ou de anotação) |
| `_DOE` | Metadados, para rastreabilidade |

---

## Tolerâncias da leitura

O que a ferramenta aceita sem reclamar:

- **Vírgula ou ponto decimal**, e separador de milhar: `0,5`, `0.5`, `1.234,56`,
  `1,234.56`.
- **Acentos e maiúsculas** em qualquer rótulo ou nome de aba.
- **Colunas reordenadas** — são localizadas pelo cabeçalho, não pela posição.
- **Linhas em branco** no meio da tabela de fatores.
- **Sinônimos** no objetivo: `maximizar`, `máximo`, `max`, `maior`, `aumentar`.

O que ela recusa, com mensagem dizendo o que fazer:

- Menos de 2 ou mais de 4 fatores.
- Mínimo maior ou igual ao máximo.
- Dois fatores com o mesmo nome.
- Objetivo `alvo` sem valor alvo.
- Planilha de ensaios sem a aba `_DOE`.
- Menos ensaios preenchidos do que coeficientes a estimar.

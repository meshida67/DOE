    clear variaveis
variaveis(1) = Variavel();
variaveis(2) = Variavel();
resultado = Variavel();

prompt = {'Nome da primeira variável', 'Unidade da primeira variável', 'Limite inferior da primeira variável', 'Limite superior da primeira variável'};
dlgtitle = 'Dados da primeira variável';
fieldsize = [1 45; 1 45; 1 45; 1 45];
in = inputdlg(prompt, dlgtitle, fieldsize);

if ~isempty(in)
    variaveis(1).Nome = in{1};
    variaveis(1).Unidade = in{2};
    variaveis(1).Min = str2double(in{3});
    variaveis(1).Max = str2double(in{4});
end

prompt = {'Nome da segunda variável', 'Unidade da segunda variável', 'Limite inferior da segunda variável', 'Limite superior da segunda variável'};
dlgtitle = 'Dados da segunda variável';
in = inputdlg(prompt, dlgtitle, fieldsize);

if ~isempty(in)
    variaveis(2).Nome = in{1};
    variaveis(2).Unidade = in{2};
    variaveis(2).Min = str2double(in{3});
    variaveis(2).Max = str2double(in{4});
end

prompt = {'Nome do valor a ser otimizado', 'Unidade do valor a ser otimizado'};
dlgtitle = 'Dados do valor a ser otimizado';
fieldsize = [1 45; 1 45];
in = inputdlg(prompt, dlgtitle, fieldsize);

if ~isempty(in)
    resultado.Nome = in{1};
    resultado.Unidade = in{2};
end

delta = zeros(1, 2);
delta(1) = (variaveis(1).Max - variaveis(1).Min)/2;
delta(2) = (variaveis(2).Max - variaveis(2).Min)/2;

B1 = zeros(9, 1);
for i = 1:3
    for j = 1:3
        B1(3 * i + j - 3) =  i - 2;
    end
end

B2 = zeros(9, 1);
for i = 1:3
    for j = 1:3
        B2(3 * i + j - 3) = j - 2;
    end
end

prompt = sprintf('Realize os seguintes ensaios em ordem aleatória:');
for i = 1:9
    aux1 = B1(i) * delta(1) + variaveis(1).Min + delta(1);
    aux2 = B2(i) * delta(2) + variaveis(2).Min + delta(2);
    prompt = [prompt, sprintf('\n%d. %s = %f %s, %s = %f %s', i,variaveis(1).Nome, aux1, variaveis(1).Unidade, variaveis(2).Nome, aux2, variaveis(2).Unidade)];
end
questdlg(prompt, 'Ensaios', 'Ok', 'Ok');

aux3 = B1 .* B1;
aux4 = B2 .* B2;
aux5 = B1 .* B2;

A = ones(9, 1);
X = [A , B1 , B2 , aux3 , aux4 , aux5];

Y = zeros(9, 1);
for i = 1:9
    prompt = sprintf('Resultado do ensaio %d', i);
    in = inputdlg(prompt, 'Resultados', [1 45]);
    if ~isempty(in)
        Y(i) = str2double(in{1});
    end
end

b = (X' * X) \ (X' * Y);
resposta = modelo(0, 0, b);


% Andando no superficie de resposta
if b(2) == 0
    b(2) = 1;
end

caminho(1) = 0.01;
caminho(2) = 0.01 * b(3) / b(2); 



valor_max = resposta;
passos = 0;
x1 = 0;
x2 = 0;
x1_in_range = (-1 <= x1) && (x1 <= 1);
x2_in_range = (-1 <= x2) && (x2 <= 1);
while (resposta >= valor_max && x1_in_range && x2_in_range)
    valor_max = resposta;
    passos = passos + 1;
    x1 = x1 + caminho(1);
    x2 = x2 + caminho(2);
    resposta = modelo(x1, x2, b);
    x1_in_range = (-1 <= x1) && (x1 <= 1);
    x2_in_range = (-1 <= x2) && (x2 <= 1);
end

% Os valores otimos

resposta = modelo(x1 - caminho(1), x2 - caminho(2), b);
x1 = (x1 - caminho(1)) * delta(1) + variaveis(1).Min + delta(1);
x2 = (x2 - caminho(2)) * delta(2) + variaveis(2).Min + delta(2);

x = - ([2*b(4), b(6); b(6), 2*b(5)] \ [b(2); b(3)]);
if (x(1) <= 1 && x(1) >= -1 && x(2) <= 1 && x(2) >= -1)
    x1 = x(1) * delta(1) + variaveis(1).Min + delta(1);
    x2 = x(2) * delta(2) + variaveis(2).Min + delta(2);
    resposta = modelo(x1, x2, b);
end

% Imprimindo a saida
prompt = sprintf('O %s maximo eh %f %s quando \%s1 = %f %s, %s = %f %s', resultado.Nome, resposta, resultado.Unidade, variaveis(1).Nome, x1,variaveis(1).Unidade, variaveis(2).Nome, x2, variaveis(2).Unidade ...
    );
questdlg(prompt, 'Valor maximo', 'Ok', 'Ok');

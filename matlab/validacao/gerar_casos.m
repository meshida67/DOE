function gerar_casos(arquivo_entrada, arquivo_saida)
% GERAR_CASOS  Calcula, em MATLAB, os valores de referência dos casos de teste.
%
%   gerar_casos()
%   gerar_casos('../../tests/casos-referencia.json', '../../tests/casos-matlab.json')
%
% Lê as definições de caso (fatores, configuração e resultados y) do arquivo de
% referência, refaz TODA a matemática independentemente em MATLAB e grava um
% segundo arquivo no mesmo formato. Em seguida, na raiz do projeto:
%
%   node tests/validar.mjs tests/casos-matlab.json
%
% Se o runner passar, a implementação JavaScript entregue aos usuários
% concorda com o MATLAB dentro da tolerância — que é o papel que o MATLAB
% cumpre neste projeto: referência matemática, não camada de entrega.
%
% Requer apenas MATLAB base (jsondecode/jsonencode, R2016b+). Sem toolboxes.

    if nargin < 1 || isempty(arquivo_entrada)
        aqui = fileparts(mfilename('fullpath'));
        arquivo_entrada = fullfile(aqui, '..', '..', 'tests', 'casos-referencia.json');
    end
    if nargin < 2 || isempty(arquivo_saida)
        aqui = fileparts(mfilename('fullpath'));
        arquivo_saida = fullfile(aqui, '..', '..', 'tests', 'casos-matlab.json');
    end

    texto = fileread(arquivo_entrada);
    ref = jsondecode(texto);

    casos_in = ref.casos;
    if ~iscell(casos_in)
        casos_in = num2cell(casos_in);
    end

    saida = struct();
    saida.fonte = sprintf('matlab %s', version('-release'));
    saida.descricao = 'Valores de referência recalculados em MATLAB a partir das mesmas definições de caso.';
    saida.geradoEm = datestr(now, 'yyyy-mm-ddTHH:MM:SS');
    casos_out = {};

    for ic = 1:numel(casos_in)
        caso = casos_in{ic};
        spec = caso.spec;
        fatores = spec.fatores;
        if ~isstruct(fatores)
            error('Formato inesperado no campo fatores do caso %s', caso.nome);
        end
        k = numel(fatores);

        nc = 3;
        tipo_alpha = 'face';
        if isfield(spec, 'config')
            if isfield(spec.config, 'pontosCentrais'), nc = spec.config.pontosCentrais; end
            if isfield(spec.config, 'tipoAlpha'), tipo_alpha = spec.config.tipoAlpha; end
        end
        alpha = resolver_alpha(tipo_alpha, k, nc);

        % Codificação em modo "limites absolutos": a coordenada mais extrema do
        % planejamento cai exatamente sobre o limite informado pelo usuário.
        extremo = max(abs(alpha), 1);
        centro  = zeros(1, k);
        unidade = zeros(1, k);
        for j = 1:k
            centro(j)  = (fatores(j).min + fatores(j).max) / 2;
            unidade(j) = ((fatores(j).max - fatores(j).min) / 2) / extremo;
        end

        Xc = matriz_ccd(k, alpha, nc);      % ordem padrão
        n  = size(Xc, 1);

        out = struct();
        out.nome = caso.nome;
        out.spec = spec;
        out.tolerancia = 1e-8;

        % ---- propriedades do planejamento -------------------------------
        p = 1 + 2*k + k*(k-1)/2;
        ep = struct();
        ep.alpha = alpha;
        ep.totalEnsaios = n;
        ep.pontosFatoriais = 2^k;
        ep.pontosAxiais = 2*k;
        ep.pontosCentrais = nc;
        ep.numeroCoeficientes = p;
        ep.glResiduo = n - p;
        ep.glErroPuro = nc - 1;
        ep.unidadeCodificada = unidade;
        reais = centro + Xc .* unidade;
        ep.minimoReal = min(reais, [], 1);
        ep.maximoReal = max(reais, [], 1);
        out.esperadoPlanejamento = ep;

        % ---- análise, quando o caso traz resultados ----------------------
        if isfield(caso, 'y') && ~isempty(caso.y)
            y = caso.y(:);
            if numel(y) ~= n
                error('Caso %s: %d resultados para %d ensaios.', caso.nome, numel(y), n);
            end
            out.y = y';

            X = montar_X(Xc, k);
            beta = X \ y;                     % QR internamente, não equações normais
            previsto = X * beta;
            residuo  = y - previsto;

            sq_res   = sum(residuo.^2);
            sq_total = sum((y - mean(y)).^2);
            sq_reg   = sq_total - sq_res;
            gl_total = n - 1;
            gl_reg   = p - 1;
            gl_res   = n - p;

            % Erro puro a partir das repetições no ponto central.
            centrais = all(abs(Xc) < 1e-12, 2);
            y_c = y(centrais);
            sq_erro_puro = sum((y_c - mean(y_c)).^2);
            gl_erro_puro = numel(y_c) - 1;

            e = struct();
            e.beta = beta';
            e.sqTotal = sq_total;
            e.sqRegressao = sq_reg;
            e.sqResiduo = sq_res;
            e.sqErroPuro = sq_erro_puro;
            e.glRegressao = gl_reg;
            e.glResiduo = gl_res;
            e.glTotal = gl_total;
            e.glErroPuro = gl_erro_puro;
            e.glFaltaAjuste = gl_res - gl_erro_puro;
            e.r2 = 1 - sq_res / sq_total;

            % Ponto estacionário e análise canônica.
            [B, b_lin] = partes_quadraticas(beta, k);
            x_est = (2*B) \ (-b_lin);
            e.estacionarioCodificado = x_est';
            e.estacionarioPrevisto = avaliar(x_est', beta, k);
            e.estacionarioReal = centro + x_est' .* unidade;

            autov = sort(eig(B), 'descend');
            e.autovalores = autov';
            e.somaAutovalores = sum(autov);
            e.produtoAutovalores = prod(autov);

            tol_eig = max(abs(autov)) * 1e-8;
            if any(abs(autov) <= tol_eig)
                e.tipoSuperficie = 'cume';
            elseif all(autov < -tol_eig)
                e.tipoSuperficie = 'maximo';
            elseif all(autov > tol_eig)
                e.tipoSuperficie = 'minimo';
            else
                e.tipoSuperficie = 'sela';
            end

            % Ótimo restrito à caixa [-extremo, extremo]^k, por grade fina
            % seguida de um passo de Newton (exato em modelo quadrático).
            objetivo = 'maximizar';
            if isfield(spec, 'resposta') && isfield(spec.resposta, 'objetivo')
                objetivo = spec.resposta.objetivo;
            end
            [x_ot, y_ot] = otimo_restrito(beta, k, extremo, objetivo);
            e.otimoCodificado = x_ot;
            e.otimoPrevisto = y_ot;
            e.otimoNaBorda = any(abs(abs(x_ot) - extremo) < 1e-6);

            out.esperado = e;
        end

        casos_out{end+1} = out; %#ok<AGROW>
    end

    saida.casos = casos_out;

    % 'PrettyPrint' só existe a partir do R2021a; em versões anteriores o JSON
    % sai numa linha só, o que não faz diferença para o runner.
    try
        json = jsonencode(saida, 'PrettyPrint', true);
    catch
        json = jsonencode(saida);
    end

    fid = fopen(arquivo_saida, 'w');
    if fid < 0, error('Não consegui abrir %s para escrita.', arquivo_saida); end
    fprintf(fid, '%s', json);
    fclose(fid);

    fprintf('Gravado: %s\n', arquivo_saida);
    fprintf('Agora rode, na raiz do projeto:\n  node tests/validar.mjs tests/casos-matlab.json\n');
end

% =========================================================================

function a = resolver_alpha(tipo, k, nc)
    switch lower(tipo)
        case 'face',          a = 1;
        case 'rotacionavel',  a = (2^k)^(1/4);
        case 'ortogonal'
            F = 2^k; N = F + 2*k + nc;
            a = sqrt((sqrt(N*F) - F) / 2);
        otherwise
            a = str2double(tipo);
            if isnan(a) || a <= 0
                error('Valor de alpha inválido: %s', tipo);
            end
    end
end

function Xc = matriz_ccd(k, alpha, nc)
% Ordem padrão: fatorial 2^k em ordem de Yates, depois axial, depois central.
    fat = zeros(2^k, k);
    for i = 0:(2^k - 1)
        for j = 1:k
            if bitand(bitshift(i, -(j-1)), 1)
                fat(i+1, j) = 1;
            else
                fat(i+1, j) = -1;
            end
        end
    end
    ax = zeros(2*k, k);
    linha = 1;
    for j = 1:k
        for s = [-1, 1]
            ax(linha, j) = s * alpha;
            linha = linha + 1;
        end
    end
    Xc = [fat; ax; zeros(nc, k)];
end

function X = montar_X(Xc, k)
% Ordem dos termos: intercepto, lineares, quadráticos, interações.
    n = size(Xc, 1);
    colunas = {ones(n, 1)};
    for i = 1:k, colunas{end+1} = Xc(:, i); end            %#ok<AGROW>
    for i = 1:k, colunas{end+1} = Xc(:, i).^2; end         %#ok<AGROW>
    for i = 1:k
        for j = (i+1):k
            colunas{end+1} = Xc(:, i) .* Xc(:, j);         %#ok<AGROW>
        end
    end
    X = [colunas{:}];
end

function [B, b_lin] = partes_quadraticas(beta, k)
% B tal que a parte de segunda ordem seja x'Bx; os termos cruzados entram
% divididos por 2 porque b_ij*x_i*x_j se reparte entre (i,j) e (j,i).
    b_lin = beta(2:(k+1));
    B = zeros(k, k);
    for i = 1:k
        B(i, i) = beta(1 + k + i);
    end
    idx = 1 + 2*k;
    for i = 1:k
        for j = (i+1):k
            idx = idx + 1;
            B(i, j) = beta(idx) / 2;
            B(j, i) = beta(idx) / 2;
        end
    end
end

function v = avaliar(x, beta, k)
    X = montar_X(x, k);
    v = X * beta;
end

function [x_melhor, y_melhor] = otimo_restrito(beta, k, limite, objetivo)
    if strcmpi(objetivo, 'minimizar'), sinal = -1; else, sinal = 1; end

    if k <= 2, np = 241; elseif k == 3, np = 61; else, np = 31; end
    eixo = linspace(-limite, limite, np);
    grades = cell(1, k);
    [grades{:}] = ndgrid(eixo);
    pontos = zeros(numel(grades{1}), k);
    for j = 1:k, pontos(:, j) = grades{j}(:); end

    valores = montar_X(pontos, k) * beta;
    [~, i_melhor] = max(sinal * valores);
    x_melhor = pontos(i_melhor, :);

    % Passo de Newton: exato para um quadrático, aceito só se continuar dentro
    % da caixa e melhorar o resultado (descarta sela e mínimo ao maximizar).
    [B, b_lin] = partes_quadraticas(beta, k);
    g = b_lin' + 2 * (B * x_melhor')';
    passo = ((2*B) \ (-g'))';
    candidato = x_melhor + passo;
    if all(abs(candidato) <= limite + 1e-12)
        if sinal * avaliar(candidato, beta, k) > sinal * avaliar(x_melhor, beta, k)
            x_melhor = candidato;
        end
    end
    y_melhor = avaliar(x_melhor, beta, k);
end

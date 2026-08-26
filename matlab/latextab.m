function latextab(T)
    if ~istable(T)
        error('O argumento de entrada deve ser uma table.');
    end

    fpw = fopen("latextab.txt", "w");
    if fpw == -1
        error('Não foi possível criar o arquivo latextab.txt.');
    end

    ncol = width(T);
    nrow = height(T);

    fprintf(fpw, "\\begin{table}[H]\n\t\\centering\n\n\t\\caption{<<inserir legenda da tabela>>}\n\t\\label{<<inserir referência da tabela>>}\n\n\t\\begin{tabular}{");

    for i = 1:ncol
        fprintf(fpw, "c");
        if i == ncol
            fprintf(fpw, "}\n");
        else
            fprintf(fpw, " ");
        end
    end

    fprintf(fpw, "\t\t\\toprule\n\t\t");
    
    varNames = T.Properties.VariableNames;
    for i = 1:ncol
        fprintf(fpw, "%s", varNames{i});
        if i == ncol
            fprintf(fpw, " \\\\\n");
        else
            fprintf(fpw, " & ");
        end
    end

    fprintf(fpw, "\t\t\\midrule\n");

    for k = 1:nrow
        fprintf(fpw, "\t\t");
        for j = 1:ncol
            val = T{k, j};
            if isnumeric(val)
                fprintf(fpw, "%.2f", val);
            elseif iscell(val)
                fprintf(fpw, "%s", string(val{1}));
            else
                fprintf(fpw, "%s", string(val));
            end
            
            if j == ncol
                fprintf(fpw, " \\\\\n");
            else
                fprintf(fpw, " & ");
            end
        end
    end

    fprintf(fpw, "\t\t\\bottomrule\n");
    fprintf(fpw, "\t\\end{tabular}\n");
    fprintf(fpw, "\\end{table}\n");

    fclose(fpw);
end
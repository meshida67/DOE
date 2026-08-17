function latextab(T)
    fpw = fopen("latextab.txt", "w");

    %numero de colunas
    ncol = width(T);
    nrow = height(T);

    %cabeçalho do tabular
    fprintf(fpw, "\\begin{table}[H] \n \t\\centering\n\n \t\\caption{<<inserir legenda da tabela>>} \n \t\\label{<<inserir referência da tabela>>} \n\n \t\\begin{tabular}{");

    for i = 1:ncol
        fprintf(fpw, "c");

        if (i == ncol)
            fprintf(fpw, "}\n");
        else
            fprintf(fpw, " ");
        end
    end

    %cabeçalho da tabela
    fprintf(fpw, "\t\t\\toprule\n\t\t");
    for i = 1:ncol
        fprintf(fpw, "%s ", string(T.Properties.VariableNames(i)));

        if (i == ncol)
            fprintf(fpw, "\\\\ \n");
        else
            fprintf(fpw, "& ");
        end
    end

    fprintf(fpw, "\t\t\\midrule\n");

    %corpo da tabela
    for k = 1:nrow
        fprintf(fpw, "\t\t");
        for j = 1:ncol
            fprintf(fpw, "%.2f", T{k, j});
            
            if (j == ncol)
                fprintf(fpw, "\\\\ \n");
            else
                fprintf(fpw, " & ");
            end
        end
    end

    %rodapé da tabela
    fprintf(fpw, "\t\t\\bottomrule\n");
    fprintf(fpw, "\t\\end{tabular}\n");
    fprintf(fpw, "\\end{table}");


    fclose(fpw);
end
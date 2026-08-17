import tkinter as tk
from tkinter import ttk
from tkinter import messagebox

# Criando a janela principal
root = tk.Tk()
root.title("Exemplo")
root.geometry("400x200")

# Criando o nome da janela
prompt_label = ttk.Label(
    root,
    text = "Digite o numero de variaveis:",
    font = ("ComicsSans", 12)
)

# Posicionando o nome na janela
prompt_label.grid(row = 0, column = 0, padx = 10, pady = 20, sticky = "w")

# Criando a caixa de input
num_entry = ttk.Entry(
    root,
    width = 30,
    font = ("ComicsSans", 12)
)

# Posicionando a caixa de input na janela
num_entry.grid(row = 0, column = 1, padx = 10, pady = 20, sticky = "w")

# Definindo uma funcao para lidar com o input
def handle_submission():
    num_var = num_entry.get().strip() # .strip remove espacos extras

    if not num_var:
        messagebox.showerror("Erro", "Digite o numero de variaveis")

    messagebox.showinfo("Sucesso")
    num_entry.delete(0, tk.END)
    root.destroy()

# Criando um botao
submit_button = ttk.Button(
    root,
    text = "Enviar",
    command = handle_submission,
    style = "Accent.TButton"
)



# Posicionando o botao
submit_button.grid(row = 1, column = 0, columnspan = 2, pady = 10)

root.mainloop()

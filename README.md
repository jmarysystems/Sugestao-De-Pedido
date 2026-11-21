# Sugestão de Pedido

Montagem de sugestões de pedido por lista de produtos e geração dos
**pedidos sugeridos por fornecedor**.

## Telas

- **Dashboard** — totais de listas, itens e sugestões por fornecedor
- **Sugestão de Pedido** — escolhe a lista, procura produtos e define quantidades
- **Pedidos Sugeridos** — agrupa os itens da lista por fornecedor
- **Listas** — cria, renomeia e exclui listas
- **Fornecedores, Prod. por fornecedor, Produtos, Usuários** — atalhos para os
  sistemas que já existem

## Banco

Usa as tabelas existentes:

- `lista_de_produtos` — itens da lista (lista, sku, descrição, quantidade)
- `produto_por_fornecedor` — define o fornecedor de cada produto
- `produtos`, `fornecedores`

Permissões pelo módulo **sugestao** do Controle de Acesso.

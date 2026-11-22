// Dashboard da Sugestão de Pedido.
import { listar } from '../api.js?v=20261122f';
import * as ui from '../ui.js?v=20261122f';

export async function render(raiz, ctx) {
  ctx.setTitulo('Dashboard');

  const [itens, vinculos, fornecedores, produtos] = await Promise.all([
    listar('lista_de_produtos', { ordem: 'lista' }),
    listar('produto_por_fornecedor', { select: '*, fornecedores(razao_social)' }),
    listar('fornecedores', { ordem: 'razao_social' }),
    listar('produtos', { select: 'id, sku, descricao, ativo' }),
  ]);

  const listas = [...new Set(itens.map((i) => i.lista))];
  const mapaFornecedor = new Map();
  for (const v of vinculos) {
    mapaFornecedor.set(v.produto_id, v.fornecedores?.razao_social || 'Sem fornecedor');
  }

  const porFornecedor = new Map();
  for (const item of itens) {
    const nome = (item.produto_id && mapaFornecedor.get(item.produto_id)) || 'Sem fornecedor';
    const atual = porFornecedor.get(nome) || { itens: 0, quantidade: 0 };
    atual.itens += 1;
    atual.quantidade += Number(item.quantidade) || 0;
    porFornecedor.set(nome, atual);
  }

  const linhas = [...porFornecedor.entries()]
    .sort((a, b) => b[1].itens - a[1].itens)
    .map(([nome, dados]) => `<tr>
      <td>${ui.esc(nome)}</td>
      <td class="num">${ui.num(dados.itens, 0)}</td>
      <td class="num">${ui.num(dados.quantidade, 2)}</td>
    </tr>`).join('');

  raiz.innerHTML = `
    <div class="kpis">
      <div class="kpi">
        <div class="rotulo">Listas de sugestão</div>
        <div class="valor">${ui.num(listas.length, 0)}</div>
        <div class="detalhe">listas com itens</div>
      </div>
      <div class="kpi">
        <div class="rotulo">Itens sugeridos</div>
        <div class="valor">${ui.num(itens.length, 0)}</div>
        <div class="detalhe">produtos nas listas</div>
      </div>
      <div class="kpi">
        <div class="rotulo">Produtos com fornecedor</div>
        <div class="valor">${ui.num(vinculos.length, 0)}</div>
        <div class="detalhe">de ${ui.num(produtos.length, 0)} produtos</div>
      </div>
      <div class="kpi">
        <div class="rotulo">Fornecedores</div>
        <div class="valor">${ui.num(fornecedores.length, 0)}</div>
        <div class="detalhe">cadastrados</div>
      </div>
    </div>

    <div class="cartao">
      <h2>Sugestões por fornecedor</h2>
      ${porFornecedor.size ? `<div class="tabela-rolagem"><table>
        <thead><tr><th>Fornecedor</th><th class="num">Itens</th><th class="num">Quantidade</th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>`
        : ui.vazio('Nenhum item sugerido ainda. Comece em "Sugestão de Pedido".')}
    </div>`;
}

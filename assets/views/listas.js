// Listas: gerencia as listas de sugestão de pedido.
import { listar, atualizar, excluirOnde } from '../api.js?v=20261122j';
import * as ui from '../ui.js?v=20261122j';

export async function render(raiz, ctx) {
  ctx.setTitulo('Listas');

  const podeExcluir = ctx.pode('sugestao', 'excluir');
  const podeEditar = ctx.pode('sugestao', 'editar') || ctx.pode('sugestao', 'cadastrar');

  const itens = await listar('lista_de_produtos', { ordem: 'lista' });

  const resumo = new Map();
  for (const item of itens) {
    const atual = resumo.get(item.lista) || { itens: 0, quantidade: 0 };
    atual.itens += 1;
    atual.quantidade += Number(item.quantidade) || 0;
    resumo.set(item.lista, atual);
  }

  const linhas = [...resumo.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([nome, dados]) => `<tr>
      <td>${ui.esc(nome)}</td>
      <td class="num">${ui.num(dados.itens, 0)}</td>
      <td class="num">${ui.num(dados.quantidade, 2)}</td>
      <td class="acoes">
        <a class="botao-pequeno" href="#/sugestao">Abrir</a>
        ${podeEditar ? `<button type="button" class="botao-pequeno"
          data-renomear="${ui.esc(nome)}">Renomear</button>` : ''}
        ${podeExcluir ? `<button type="button" class="botao-pequeno botao-perigo"
          data-apagar="${ui.esc(nome)}">Excluir</button>` : ''}
      </td>
    </tr>`).join('');

  raiz.innerHTML = `
    <div class="cartao">
      <div class="cartao-topo"><h2>${resumo.size} lista(s)</h2></div>
      <p class="sub">Cada lista é um conjunto de produtos sugeridos. Ao abrir, você escolhe
        o fornecedor de cada item em "Pedidos Sugeridos".</p>
      ${resumo.size ? `<div class="tabela-rolagem"><table>
        <thead><tr><th>Lista</th><th class="num">Itens</th>
          <th class="num">Quantidade</th><th></th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>` : ui.vazio('Nenhuma lista criada. Use "Sugestão de Pedido" para começar.')}
    </div>`;

  for (const b of raiz.querySelectorAll('[data-renomear]')) {
    b.addEventListener('click', async () => {
      const antigo = b.dataset.renomear;
      const novo = window.prompt('Novo nome da lista:', antigo);
      if (!novo || novo.trim() === antigo) return;

      try {
        const afetados = itens.filter((i) => i.lista === antigo);
        for (const item of afetados) {
          await atualizar('lista_de_produtos', item.id, { lista: novo.trim() });
        }
        ui.toast(`${afetados.length} item(ns) renomeado(s).`);
        ctx.recarregar();
      } catch (erro) { ui.toast(erro.message, 'erro'); }
    });
  }

  for (const b of raiz.querySelectorAll('[data-apagar]')) {
    b.addEventListener('click', async () => {
      const nome = b.dataset.apagar;
      if (!window.confirm(`Excluir a lista "${nome}" e todos os seus itens?`)) return;
      try {
        await excluirOnde('lista_de_produtos', { lista: nome });
        ui.toast('Lista excluída.');
        ctx.recarregar();
      } catch (erro) { ui.toast(erro.message, 'erro'); }
    });
  }
}

// Sugestão de Pedido: monta a lista de produtos a pedir.
import { listar, criar, atualizar, excluir, excluirOnde } from '../api.js?v=20261121a';
import * as ui from '../ui.js?v=20261121a';

export async function render(raiz, ctx) {
  ctx.setTitulo('Sugestão de Pedido');

  const podeEditar = ctx.pode('sugestao', 'editar') || ctx.pode('sugestao', 'cadastrar');
  const podeExcluir = ctx.pode('sugestao', 'excluir');

  const [itens, produtos] = await Promise.all([
    listar('lista_de_produtos', { ordem: 'ordem' }),
    listar('produtos', { select: 'id, sku, descricao, unidade', ordem: 'sku' }),
  ]);

  const listas = [...new Set(itens.map((i) => i.lista))].sort();
  const listaAtual = localStorage.getItem('sugestao.lista') || listas[0] || 'Sugestão 1';

  raiz.innerHTML = `
    <div class="cartao">
      <div class="cartao-topo"><h2>Montar sugestão</h2></div>
      <p class="sub">Escolha a lista, procure os produtos e informe a quantidade a pedir.</p>

      <div class="grade grade-2">
        <label class="campo"><span>Lista</span>
          <select id="lista">
            ${listas.map((l) => `<option value="${ui.esc(l)}" ${
              l === listaAtual ? 'selected' : ''}>${ui.esc(l)}</option>`).join('')}
            <option value="__nova">+ nova lista…</option>
          </select></label>
        <label class="campo"><span>Produto (SKU ou descrição)</span>
          <input type="search" id="busca-produto" placeholder="digite para procurar"></label>
      </div>

      <div id="resultados" class="sub" style="margin-top:8px"></div>
    </div>

    <div class="cartao">
      <div class="cartao-topo">
        <h2>Itens da lista <span id="nome-lista"></span></h2>
        <span class="sub" id="resumo"></span>
      </div>
      <div id="tabela"></div>
    </div>`;

  const selLista = raiz.querySelector('#lista');
  const busca = raiz.querySelector('#busca-produto');
  const resultados = raiz.querySelector('#resultados');
  const tabela = raiz.querySelector('#tabela');
  const nomeLista = raiz.querySelector('#nome-lista');
  const resumo = raiz.querySelector('#resumo');

  let lista = listaAtual;

  function itensDaLista() {
    return itens
      .filter((i) => i.lista === lista)
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
  }

  function desenhar() {
    nomeLista.textContent = `— ${lista}`;
    const daLista = itensDaLista();

    resumo.textContent = daLista.length
      ? `${daLista.length} item(ns) · quantidade total ${ui.num(
        daLista.reduce((s, i) => s + (Number(i.quantidade) || 0), 0), 2)}`
      : '';

    tabela.innerHTML = daLista.length ? `
      <div class="tabela-rolagem"><table>
        <thead><tr><th>SKU</th><th>Descrição</th><th>Un.</th>
          <th class="num">Quantidade</th><th></th></tr></thead>
        <tbody>
          ${daLista.map((i) => `<tr>
            <td class="mono">${ui.esc(i.sku || '')}</td>
            <td>${ui.esc(i.descricao || '')}</td>
            <td>${ui.esc(i.unidade || '')}</td>
            <td class="num">
              <input type="number" step="0.001" value="${i.quantidade ?? 0}"
                     data-qtd="${ui.esc(i.id)}" style="width:110px;text-align:right">
            </td>
            <td>${podeExcluir ? `<button type="button" class="botao-pequeno botao-perigo"
              data-remover="${ui.esc(i.id)}">Remover</button>` : ''}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>` : ui.vazio('Nenhum item nesta lista.');

    for (const campo of tabela.querySelectorAll('[data-qtd]')) {
      campo.addEventListener('change', async () => {
        try {
          await atualizar('lista_de_produtos', campo.dataset.qtd,
            { quantidade: Number(campo.value) || 0 });
          const item = itens.find((i) => i.id === campo.dataset.qtd);
          if (item) item.quantidade = Number(campo.value) || 0;
          desenhar();
        } catch (erro) { ui.toast(erro.message, 'erro'); }
      });
    }

    for (const b of tabela.querySelectorAll('[data-remover]')) {
      b.addEventListener('click', async () => {
        if (!window.confirm('Remover este item da lista?')) return;
        try {
          await excluir('lista_de_produtos', b.dataset.remover);
          const idx = itens.findIndex((i) => i.id === b.dataset.remover);
          if (idx >= 0) itens.splice(idx, 1);
          ui.toast('Item removido.');
          desenhar();
        } catch (erro) { ui.toast(erro.message, 'erro'); }
      });
    }
  }

  selLista.addEventListener('change', async () => {
    if (selLista.value === '__nova') {
      const nome = window.prompt('Nome da nova lista:');
      if (!nome) { selLista.value = lista; return; }
      lista = nome.trim();
      if (!listas.includes(lista)) listas.push(lista);
      const opt = document.createElement('option');
      opt.value = lista;
      opt.textContent = lista;
      selLista.insertBefore(opt, selLista.lastElementChild);
      selLista.value = lista;
    } else {
      lista = selLista.value;
    }
    localStorage.setItem('sugestao.lista', lista);
    desenhar();
  });

  // -------------------------------------------------------- busca produto
  function desenharResultados(termo) {
    const t = termo.trim().toLowerCase();
    if (t.length < 2) { resultados.innerHTML = ''; return; }

    const achados = produtos
      .filter((p) => !p.ativo === false || true)
      .filter((p) => `${p.sku} ${p.descricao}`.toLowerCase().includes(t))
      .slice(0, 12);

    resultados.innerHTML = achados.length
      ? `<div class="tabela-rolagem"><table>
          <thead><tr><th>SKU</th><th>Descrição</th><th>Un.</th><th class="num">Qtd</th><th></th></tr></thead>
          <tbody>
            ${achados.map((p) => `<tr>
              <td class="mono">${ui.esc(p.sku)}</td>
              <td>${ui.esc(p.descricao)}</td>
              <td>${ui.esc(p.unidade || '')}</td>
              <td class="num"><input type="number" step="0.001" value="1"
                     id="qtd-${ui.esc(p.id)}" style="width:90px;text-align:right"></td>
              <td><button type="button" class="botao-pequeno"
                    data-add="${ui.esc(p.id)}">Adicionar</button></td>
            </tr>`).join('')}
          </tbody></table></div>`
      : '<p class="sub">Nenhum produto encontrado.</p>';

    for (const b of resultados.querySelectorAll('[data-add]')) {
      b.addEventListener('click', async () => {
        const produto = produtos.find((p) => p.id === b.dataset.add);
        const qtd = Number(resultados.querySelector(`#qtd-${b.dataset.add}`)?.value) || 1;

        if (!podeEditar) { ui.toast('Sem permissão para alterar a lista.', 'erro'); return; }
        if (itens.some((i) => i.lista === lista && i.produto_id === produto.id)) {
          ui.toast('Este produto já está na lista.', 'erro');
          return;
        }

        try {
          const novo = await criar('lista_de_produtos', {
            lista,
            sku: produto.sku,
            descricao: produto.descricao,
            unidade: produto.unidade || 'UN',
            quantidade: qtd,
            produto_id: produto.id,
            ordem: itensDaLista().length + 1,
          });
          itens.push(novo);
          ui.toast('Produto adicionado.');
          busca.value = '';
          resultados.innerHTML = '';
          desenhar();
        } catch (erro) { ui.toast(erro.message, 'erro'); }
      });
    }
  }

  busca.addEventListener('input', () => desenharResultados(busca.value));

  desenhar();
}

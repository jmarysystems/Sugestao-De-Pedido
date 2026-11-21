// Pedidos Sugeridos: agrupa os itens da lista por fornecedor.
import { listar } from '../api.js?v=20261121c';
import * as ui from '../ui.js?v=20261121c';

export async function render(raiz, ctx) {
  ctx.setTitulo('Pedidos Sugeridos');

  const [itens, vinculos] = await Promise.all([
    listar('lista_de_produtos', { ordem: 'ordem' }),
    listar('produto_por_fornecedor', { select: '*, fornecedores(razao_social)' }),
  ]);

  const listas = [...new Set(itens.map((i) => i.lista))].sort();
  const listaAtual = localStorage.getItem('sugestao.lista') || listas[0] || '';

  if (!listas.length) {
    raiz.innerHTML = `<div class="cartao"><h2>Pedidos Sugeridos</h2>
      ${ui.vazio('Nenhuma lista com itens ainda. Monte a sugestão primeiro.')}</div>`;
    return;
  }

  const mapaFornecedor = new Map();
  for (const v of vinculos) {
    if (v.produto_id) mapaFornecedor.set(v.produto_id, v.fornecedores?.razao_social || null);
  }

  raiz.innerHTML = `
    <div class="cartao">
      <div class="cartao-topo"><h2>Pedidos sugeridos por fornecedor</h2></div>
      <label class="campo" style="max-width:340px"><span>Lista</span>
        <select id="lista">
          ${listas.map((l) => `<option value="${ui.esc(l)}" ${
            l === listaAtual ? 'selected' : ''}>${ui.esc(l)}</option>`).join('')}
        </select></label>
    </div>
    <div id="conteudo"></div>`;

  const selLista = raiz.querySelector('#lista');
  const conteudo = raiz.querySelector('#conteudo');

  function desenhar() {
    const lista = selLista.value;
    localStorage.setItem('sugestao.lista', lista);

    const daLista = itens.filter((i) => i.lista === lista);
    const grupos = new Map();

    for (const item of daLista) {
      const fornecedor = item.fornecedor_nome
        || (item.produto_id && mapaFornecedor.get(item.produto_id))
        || 'Sem fornecedor';
      if (!grupos.has(fornecedor)) grupos.set(fornecedor, []);
      grupos.get(fornecedor).push(item);
    }

    if (!grupos.size) {
      conteudo.innerHTML = `<div class="cartao">${ui.vazio('Lista sem itens.')}</div>`;
      return;
    }

    const valorTotalGeral = daLista.reduce(
      (s, i) => s + (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0), 0);

    conteudo.innerHTML = [...grupos.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([fornecedor, listaItens]) => {
        const total = listaItens.reduce((s, i) => s + (Number(i.quantidade) || 0), 0);
        const valor = listaItens.reduce(
          (s, i) => s + (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0), 0);
        const prazo = Math.max(...listaItens.map((i) => Number(i.prazo_entrega) || 0));

        return `<div class="cartao">
          <div class="cartao-topo">
            <h2>${ui.esc(fornecedor)}</h2>
            <span class="sub">${listaItens.length} item(ns) · ${ui.num(total, 2)} un. ·
              ${ui.brl(valor)}${prazo ? ` · prazo ${prazo} dia(s)` : ''}</span>
          </div>
          <div class="tabela-rolagem"><table>
            <thead><tr><th>Loja</th><th>SKU</th><th>Descrição</th><th>Embalagem</th>
              <th class="num">Qtd</th><th class="num">Valor un.</th><th class="num">Total</th></tr></thead>
            <tbody>
              ${listaItens.map((i) => `<tr>
                <td>${ui.esc(i.loja || '—')}</td>
                <td class="mono">${ui.esc(i.sku || '')}</td>
                <td>${ui.esc(i.descricao || '')}</td>
                <td>${ui.esc(i.embalagem || i.unidade || '')}</td>
                <td class="num">${ui.num(i.quantidade, 2)}</td>
                <td class="num">${i.valor_unitario != null ? ui.brl(i.valor_unitario) : '—'}</td>
                <td class="num">${ui.brl((Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0))}</td>
              </tr>`).join('')}
            </tbody>
            <tfoot><tr><th colspan="6">Total</th>
              <th class="num">${ui.brl(valor)}</th></tr></tfoot>
          </table></div>
        </div>`;
      }).join('')
      + `<div class="cartao"><strong>Total geral da lista:</strong> ${ui.brl(valorTotalGeral)}</div>`;
  }

  selLista.addEventListener('change', desenhar);
  desenhar();
}

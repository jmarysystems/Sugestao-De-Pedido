// Pedidos Sugeridos: pedidos gerados a partir das sugestões.
import { listar } from '../api.js?v=20261122p';
import * as ui from '../ui.js?v=20261122p';

export async function render(raiz, ctx) {
  ctx.setTitulo('Pedidos Sugeridos');

  const [pedidos, sugestoes] = await Promise.all([
    listar('sugestoes_pedidos', { ordem: 'criado_em', asc: false, limite: 500 }),
    listar('sugestoes', { ordem: 'nome' }),
  ]);

  if (!pedidos.length) {
    raiz.innerHTML = `
      <div class="cartao">
        <h2>Pedidos sugeridos</h2>
        ${ui.vazio('Nenhum pedido gerado ainda. Abra uma sugestão e clique em "Gerar pedido sugerido".')}
      </div>`;
    return;
  }

  const listaSugestoes = [...new Set(pedidos.map((p) => p.sugestao))].sort();

  raiz.innerHTML = `
    <div class="cartao">
      <div class="cartao-topo"><h2>${pedidos.length} pedido(s) sugerido(s)</h2></div>
      <label class="campo" style="max-width:340px"><span>Sugestão</span>
        <select id="filtro">
          <option value="">Todas</option>
          ${listaSugestoes.map((s) => `<option value="${ui.esc(s)}">${ui.esc(s)}</option>`).join('')}
        </select></label>
    </div>
    <div id="tabela"></div>`;

  const filtro = raiz.querySelector('#filtro');
  const alvo = raiz.querySelector('#tabela');

  function desenhar() {
    const lista = filtro.value;
    const visiveis = pedidos.filter((p) => !lista || p.sugestao === lista);

    const totalValor = visiveis.reduce((s, p) => s + (Number(p.valor_total) || 0), 0);
    const totalQtd = visiveis.reduce((s, p) => s + (Number(p.quantidade) || 0), 0);

    alvo.innerHTML = `<div class="cartao">
      <div class="tabela-rolagem"><table>
        <thead><tr><th>Sugestão</th><th>Fornecedor</th><th class="num">Itens</th>
          <th class="num">Quantidade</th><th class="num">Valor</th>
          <th>Status</th><th>Criado em</th><th></th></tr></thead>
        <tbody>
          ${visiveis.map((p) => `<tr>
            <td>${ui.esc(p.sugestao)}</td>
            <td>${ui.esc(p.fornecedor_nome || '—')}</td>
            <td class="num">${ui.num(p.total_itens, 0)}</td>
            <td class="num">${ui.num(p.quantidade, 0)}</td>
            <td class="num">${ui.brl(p.valor_total)}</td>
            <td>${p.status === 'enviado'
              ? ui.badge('enviado', 'verde') : ui.badge('gerado', 'azul')}</td>
            <td>${p.criado_em ? ui.dataBR(p.criado_em) : '—'}</td>
            <td class="acoes">
              <button type="button" class="botao-pequeno"
                data-itens="${ui.esc(p.id)}">Itens</button>
            </td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><th colspan="2">Total</th>
          <th class="num">${ui.num(visiveis.length, 0)}</th>
          <th class="num">${ui.num(totalQtd, 0)}</th>
          <th class="num">${ui.brl(totalValor)}</th>
          <th colspan="3"></th></tr></tfoot>
      </table></div>
    </div>`;

    for (const b of alvo.querySelectorAll('[data-itens]')) {
      b.addEventListener('click', () => {
        const pedido = pedidos.find((p) => p.id === b.dataset.itens);
        if (!pedido) return;

        const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
        ui.modal({
          titulo: `Itens — ${pedido.fornecedor_nome || ''}`,
          largura: '760px',
          corpo: itens.length ? `<div class="tabela-rolagem"><table>
            <thead><tr><th>SKU</th><th>Descrição</th><th>Un.</th>
              <th class="num">Qtd</th><th class="num">Valor un.</th><th class="num">Total</th></tr></thead>
            <tbody>
              ${itens.map((i) => `<tr>
                <td class="mono">${ui.esc(i.sku || '')}</td>
                <td>${ui.esc(i.descricao || '')}</td>
                <td>${ui.esc(i.unidade || '')}</td>
                <td class="num">${ui.num(i.quantidade, 0)}</td>
                <td class="num">${ui.brl(i.valor_unitario)}</td>
                <td class="num">${ui.brl((Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0))}</td>
              </tr>`).join('')}
            </tbody>
            <tfoot><tr><th colspan="5">Total</th>
              <th class="num">${ui.brl(pedido.valor_total)}</th></tr></tfoot>
          </table></div>` : ui.vazio('Pedido sem itens registrados.'),
        });
      });
    }
  }

  filtro.addEventListener('change', desenhar);
  desenhar();
}

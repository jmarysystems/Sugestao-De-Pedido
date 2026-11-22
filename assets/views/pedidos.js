// Pedidos Sugeridos: pedidos gerados a partir das sugestões.
import { listar, atualizar, excluir } from '../api.js?v=20261122s';
import * as ui from '../ui.js?v=20261122s';

const STATUS_PEDIDO = {
  gerado: { rotulo: 'Gerado', cor: 'azul' },
  enviado: { rotulo: 'Enviado', cor: 'verde' },
  cancelado: { rotulo: 'Cancelado', cor: 'vermelho' },
};

export async function render(raiz, ctx) {
  ctx.setTitulo('Pedidos Sugeridos');

  const pedidos = await listar('sugestoes_pedidos', {
    ordem: 'criado_em', asc: false, limite: 500,
  });

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
            <td>${ui.badge(
              (STATUS_PEDIDO[p.status] || STATUS_PEDIDO.gerado).rotulo,
              (STATUS_PEDIDO[p.status] || STATUS_PEDIDO.gerado).cor)}</td>
            <td>${p.criado_em ? ui.dataBR(p.criado_em) : '—'}</td>
            <td class="acoes">
              <button type="button" class="botao-pequeno"
                data-itens="${ui.esc(p.id)}">Itens</button>
              <button type="button" class="botao-pequeno"
                data-editar="${ui.esc(p.id)}">Editar</button>
              <button type="button" class="botao-pequeno botao-perigo"
                data-excluir="${ui.esc(p.id)}">Excluir</button>
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

    // ---------------------------------------------------------- itens
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

    // --------------------------------------------------------- editar
    for (const b of alvo.querySelectorAll('[data-editar]')) {
      b.addEventListener('click', () => {
        const pedido = pedidos.find((p) => p.id === b.dataset.editar);
        if (!pedido) return;

        const { fechar, corpo } = ui.modal({
          titulo: `Editar pedido — ${pedido.fornecedor_nome || ''}`,
          largura: '520px',
          corpo: `
            <label class="campo"><span>Fornecedor</span>
              <input id="fornecedor" value="${ui.esc(pedido.fornecedor_nome || '')}"></label>
            <label class="campo"><span>Status</span>
              <select id="status">
                ${Object.entries(STATUS_PEDIDO).map(([valor, s]) => `<option value="${valor}" ${
                  (pedido.status || 'gerado') === valor ? 'selected' : ''
                }>${ui.esc(s.rotulo)}</option>`).join('')}
              </select></label>
            <p class="sub">Os itens e os valores do pedido são mantidos.</p>
            <div class="linha-acoes" style="margin-top:12px">
              <button type="button" class="botao-primario" id="salvar">Salvar</button>
              <button type="button" id="cancelar">Cancelar</button>
            </div>
            <div class="sub" id="info" style="margin-top:8px"></div>`,
        });

        corpo.querySelector('#cancelar').addEventListener('click', fechar);

        corpo.querySelector('#salvar').addEventListener('click', async () => {
          const fornecedor = corpo.querySelector('#fornecedor').value.trim();
          const status = corpo.querySelector('#status').value;
          const info = corpo.querySelector('#info');

          if (!fornecedor) { ui.toast('Informe o fornecedor.', 'erro'); return; }

          const botao = corpo.querySelector('#salvar');
          botao.disabled = true;
          botao.textContent = 'Salvando…';

          try {
            await atualizar('sugestoes_pedidos', pedido.id, {
              fornecedor_nome: fornecedor, status,
            });
            ui.toast('Pedido atualizado.');
            fechar();
            ctx.recarregar();
          } catch (erro) {
            ui.toast(erro.message, 'erro');
            if (info) info.textContent = erro.message;
            botao.disabled = false;
            botao.textContent = 'Salvar';
          }
        });
      });
    }

    // -------------------------------------------------------- excluir
    for (const b of alvo.querySelectorAll('[data-excluir]')) {
      b.addEventListener('click', async () => {
        const pedido = pedidos.find((p) => p.id === b.dataset.excluir);
        if (!pedido) return;
        if (!window.confirm(
          `Excluir o pedido de ${pedido.fornecedor_nome || ''} (${ui.brl(pedido.valor_total)})?`)) {
          return;
        }
        b.disabled = true;
        try {
          await excluir('sugestoes_pedidos', pedido.id);
          ui.toast('Pedido excluído.');
          ctx.recarregar();
        } catch (erro) {
          ui.toast(erro.message, 'erro');
          b.disabled = false;
        }
      });
    }
  }

  filtro.addEventListener('change', desenhar);
  desenhar();
}

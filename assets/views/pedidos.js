// Pedidos Sugeridos: pedidos gerados a partir das sugestões.
import { listar, atualizar, excluir } from '../api.js?v=20261125a';
import * as ui from '../ui.js?v=20261125a';

const STATUS_PEDIDO = {
  gerado: { rotulo: 'Gerado', cor: 'azul' },
  enviado: { rotulo: 'Enviado', cor: 'verde' },
  cancelado: { rotulo: 'Cancelado', cor: 'vermelho' },
};

export async function render(raiz, ctx) {
  ctx.setTitulo('Pedidos Sugeridos');

  const [pedidos, fornecedores] = await Promise.all([
    listar('sugestoes_pedidos', { ordem: 'criado_em', asc: false, limite: 500 }),
    listar('fornecedores', { select: 'id, razao_social, cnpj_cpf' }),
  ]);

  const fornecedorPorId = new Map(fornecedores.map((f) => [f.id, f]));
  const fornecedorPorNome = new Map(
    fornecedores.map((f) => [(f.razao_social || '').toUpperCase(), f]));

  function cnpjDoFornecedor(pedido) {
    const porId = pedido.fornecedor_id ? fornecedorPorId.get(pedido.fornecedor_id) : null;
    const achado = porId
      || fornecedorPorNome.get((pedido.fornecedor_nome || '').toUpperCase());
    return achado?.cnpj_cpf || '';
  }

  function formatarCnpj(valor) {
    const d = String(valor || '').replace(/\D/g, '');
    if (d.length === 14) {
      return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    }
    if (d.length === 11) {
      return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    }
    return valor || '';
  }

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
                data-imprimir="${ui.esc(p.id)}">Imprimir</button>
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

    // ------------------------------------------------------- imprimir
    function imprimirPedido(pedido) {
      document.querySelectorAll('.area-impressao').forEach((n) => n.remove());

      const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
      const total = itens.reduce(
        (s, i) => s + (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0), 0);

      const el = document.createElement('div');
      el.className = 'area-impressao';
      el.innerHTML = `
        <div class="print-topo">
          <div>
            <h1>PEDIDO SUGERIDO</h1>
            <div class="print-linha">Fornecedor: <strong>${ui.esc(pedido.fornecedor_nome || '—')}</strong></div>
            <div class="print-linha">CNPJ: <strong>${
              ui.esc(formatarCnpj(cnpjDoFornecedor(pedido)) || '—')}</strong></div>
            <div class="print-linha">Sugestão de origem: ${ui.esc(pedido.sugestao || '—')}</div>
          </div>
          <div style="text-align:right">
            <div class="print-linha">Data: <strong>${
              ui.dataBR(pedido.criado_em || new Date().toISOString())}</strong></div>
            <div class="print-linha">Status: <strong>${
              ui.esc((STATUS_PEDIDO[pedido.status] || STATUS_PEDIDO.gerado).rotulo)}</strong></div>
            <div class="print-linha">Itens: <strong>${itens.length}</strong></div>
          </div>
        </div>

        <h2>Produtos</h2>
        <table>
          <thead>
            <tr>
              <th style="width:14%">SKU</th>
              <th>Descrição</th>
              <th style="width:10%">Un.</th>
              <th class="num" style="width:10%">Qtd</th>
              <th class="num" style="width:14%">Valor un.</th>
              <th class="num" style="width:14%">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itens.map((i) => `<tr>
              <td>${ui.esc(i.sku || '—')}</td>
              <td>${ui.esc(i.descricao || '')}</td>
              <td>${ui.esc(i.unidade || '')}</td>
              <td class="num">${ui.num(i.quantidade, 0)}</td>
              <td class="num">${ui.brl(i.valor_unitario)}</td>
              <td class="num">${ui.brl((Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0))}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr>
              <th colspan="5" class="num">TOTAL DO PEDIDO</th>
              <th class="num">${ui.brl(total)}</th>
            </tr>
          </tfoot>
        </table>

        <div class="print-rodape">
          <div>Recebido por: _______________________________________</div>
          <div>Data: ____ / ____ / ________</div>
        </div>
        <div class="print-observacao">Documento gerado pelo sistema Sugestão de Pedido em ${
          ui.dataHoraBR(new Date().toISOString())}.</div>
      `;

      document.body.appendChild(el);

      const limpar = () => {
        el.remove();
        window.removeEventListener('afterprint', limpar);
      };
      window.addEventListener('afterprint', limpar);
      setTimeout(limpar, 30000);

      window.print();
    }

    for (const b of alvo.querySelectorAll('[data-imprimir]')) {
      b.addEventListener('click', () => {
        const pedido = pedidos.find((p) => p.id === b.dataset.imprimir);
        if (pedido) imprimirPedido(pedido);
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

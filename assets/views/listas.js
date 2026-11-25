// Listas: gerencia as listas de sugestão de pedido.
import { listar, atualizar, excluir, excluirOnde } from '../api.js?v=20261125a';
import { importarLista } from '../planilha.js?v=20261125a';
import * as ui from '../ui.js?v=20261125a';

export async function render(raiz, ctx) {
  ctx.setTitulo('Listas');

  const podeExcluir = ctx.pode('sugestao', 'excluir');
  const podeEditar = ctx.pode('sugestao', 'editar') || ctx.pode('sugestao', 'cadastrar');

  const [itens, cabecalhos] = await Promise.all([
    listar('lista_de_produtos', { ordem: 'lista' }),
    listar('sugestoes', { ordem: 'nome' }),
  ]);

  const statusPorNome = new Map(cabecalhos.map((c) => [c.nome, c]));
  const nomes = new Set([
    ...itens.map((i) => i.lista),
    ...cabecalhos.map((c) => c.nome),
  ]);

  const resumo = new Map();
  for (const item of itens) {
    const atual = resumo.get(item.lista) || { itens: 0, quantidade: 0, sugerida: 0 };
    atual.itens += 1;
    atual.quantidade += Number(item.quantidade) || 0;
    atual.sugerida += Number(item.quantidade_sugerida) || 0;
    resumo.set(item.lista, atual);
  }

  const linhas = [...nomes].sort((a, b) => a.localeCompare(b)).map((nome) => {
    const d = resumo.get(nome) || { itens: 0, quantidade: 0, sugerida: 0 };
    const cab = statusPorNome.get(nome);
    return `<tr>
      <td>${ui.esc(nome)}</td>
      <td class="num">${ui.num(d.itens, 0)}</td>
      <td class="num">${ui.num(d.sugerida, 0)}</td>
      <td>${cab ? ui.badge(cab.status, 'neutro') : '—'}</td>
      <td class="acoes">
        <a class="botao-pequeno" href="#/sugestao/${encodeURIComponent(nome)}">Abrir</a>
        ${podeEditar ? `<button type="button" class="botao-pequeno"
          data-renomear="${ui.esc(nome)}">Renomear</button>` : ''}
        ${podeExcluir ? `<button type="button" class="botao-pequeno botao-perigo"
          data-apagar="${ui.esc(nome)}">Excluir</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  raiz.innerHTML = `
    <div class="cartao">
      <div class="cartao-topo">
        <h2>${nomes.size} lista(s)</h2>
        ${podeEditar ? '<button type="button" class="botao-primario" id="importar">Importar lista</button>' : ''}
      </div>
      <p class="sub">Cada lista é um conjunto de produtos sugeridos. A importação aceita
        a planilha do ressuprimento (.xlsx, .xls ou .csv) e cria os cadastros que faltarem.</p>
      ${nomes.size ? `<div class="tabela-rolagem"><table>
        <thead><tr><th>Lista</th><th class="num">Itens</th>
          <th class="num">Qtd sugerida</th><th>Status</th><th></th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>` : ui.vazio('Nenhuma lista criada. Use "Importar lista" para começar.')}
    </div>`;

  // ---------------------------------------------------------- importar
  raiz.querySelector('#importar')?.addEventListener('click', () => {
    const { fechar, corpo } = ui.modal({
      titulo: 'Importar lista',
      largura: '620px',
      corpo: `
        <p class="sub">Escolha a planilha do ressuprimento. A aba <strong>RELATORIO</strong>
          é usada automaticamente.</p>
        <label class="campo"><span>Arquivo</span>
          <input type="file" id="arquivo" accept=".xlsx,.xls,.csv"></label>
        <label class="campo"><span>Nome da nova lista</span>
          <input id="nome" value="${ui.esc(`Lista ${new Date().toLocaleDateString('pt-BR')}`)}"></label>
        <label class="campo" style="flex-direction:row;align-items:center;gap:8px">
          <input type="checkbox" id="cadastros" checked>
          <span>Criar produtos, categorias, subcategorias, famílias e lojas que não existirem</span>
        </label>
        <div class="linha-acoes" style="margin-top:14px">
          <button type="button" class="botao-primario" id="confirmar">Importar</button>
          <button type="button" id="cancelar">Cancelar</button>
        </div>
        <div class="sub" id="info" style="margin-top:10px"></div>`,
    });

    corpo.querySelector('#cancelar').addEventListener('click', fechar);

    corpo.querySelector('#confirmar').addEventListener('click', async () => {
      const arquivo = corpo.querySelector('#arquivo').files[0];
      const nome = corpo.querySelector('#nome').value.trim();
      const criarCadastros = corpo.querySelector('#cadastros').checked;
      const info = corpo.querySelector('#info');

      if (!arquivo) { ui.toast('Escolha o arquivo.', 'erro'); return; }
      if (!nome) { ui.toast('Informe o nome da lista.', 'erro'); return; }
      if (nomes.has(nome)) {
        ui.toast('Já existe uma lista com esse nome.', 'erro');
        return;
      }

      const botao = corpo.querySelector('#confirmar');
      botao.disabled = true;
      botao.textContent = 'Lendo…';

      try {
        const total = await importarLista({
          ctx,
          lista: nome,
          arquivo,
          criarCadastros,
          aoProgredir: (texto) => {
            if (info) info.textContent = texto;
            botao.textContent = texto;
          },
        });

        ui.toast(`${total} item(ns) importado(s) para "${nome}". ` +
          'Crie a sugestão em "Sugestão de Pedido" → Nova sugestão.');
        fechar();
        ctx.recarregar();
      } catch (erro) {
        ui.toast(erro.message, 'erro');
        if (info) info.textContent = erro.message;
        botao.disabled = false;
        botao.textContent = 'Importar';
      }
    });
  });

  // ---------------------------------------------------------- renomear
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
        const cab = statusPorNome.get(antigo);
        if (cab) await atualizar('sugestoes', cab.id, { nome: novo.trim() });
        ui.toast(`${afetados.length} item(ns) renomeado(s).`);
        ctx.recarregar();
      } catch (erro) { ui.toast(erro.message, 'erro'); }
    });
  }

  // ---------------------------------------------------------- excluir
  for (const b of raiz.querySelectorAll('[data-apagar]')) {
    b.addEventListener('click', async () => {
      const nome = b.dataset.apagar;
      if (!window.confirm(`Excluir a lista "${nome}" e todos os seus itens?`)) return;
      try {
        await excluirOnde('lista_de_produtos', { lista: nome });
        const cab = statusPorNome.get(nome);
        if (cab) await excluir('sugestoes', cab.id);
        ui.toast('Lista excluída.');
        ctx.recarregar();
      } catch (erro) { ui.toast(erro.message, 'erro'); }
    });
  }
}

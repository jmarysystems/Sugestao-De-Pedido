// Leitura de planilha e importação de listas (usada nas telas de Listas e Sugestão).
import { listar, criar } from './api.js?v=20261122p';

const PLANILHA_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';

export const normaliza = (v) => String(v ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().toUpperCase();

export const numero = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(n) ? null : n;
};

export const CAMPOS_POSICAO = ['gondola', 'ponto_extra', 'geladeira', 'ponta_gondola',
  'paredao_entrada', 'deposito'];

const COLUNAS = {
  loja: ['LOJA'],
  codigo_categoria: ['COD CAT', 'CODIGO CATEGORIA', 'COD CATEGORIA'],
  categoria: ['CATEGORIA'],
  codigo_subcategoria: ['COD SUBCAT', 'CODIGO SUBCATEGORIA', 'COD SUBCATEGORIA'],
  subcategoria: ['SUBCATEGORIA'],
  codigo_familia: ['COD FAM', 'CODIGO FAMILIA', 'COD FAMILIA'],
  familia: ['FAMILIA'],
  sku: ['SKU'],
  ean: ['EAN', 'CODIGO DE BARRAS'],
  descricao: ['DESCRICAO DO PRODUTO', 'DESCRICAO', 'PRODUTO'],
  embalagem: ['EMBALAGEM', 'UNIDADE'],
  quantidade_por_embalagem: ['QUANTIDADE POR EMBALAGEM', 'QTD POR EMBALAGEM'],
  gondola: ['GONDOLA'],
  ponto_extra: ['PONTO EXTRA'],
  geladeira: ['GELADEIRA'],
  ponta_gondola: ['PONTA DE GONDOLA', 'PONTA GONDOLA'],
  paredao_entrada: ['PAREDAO DE ENTRADA', 'PAREDAO'],
  deposito: ['DEPOSITO'],
  fornecedor_codigo: ['CODIGO DO FORNECEDOR', 'COD FORNECEDOR'],
  fornecedor_nome: ['NOME DO FORNECEDOR', 'FORNECEDOR'],
  prazo_entrega: ['PRAZO DE ENTREGA DO FORNECEDOR', 'PRAZO DE ENTREGA', 'PRAZO'],
  dias_venda: ['PEDIDO PARA QUANTOS DIAS DE VENDA', 'DIAS DE VENDA', 'DIAS'],
  valor_unitario: ['VALOR UNITARIO', 'CUSTO', 'PRECO'],
  venda_media: ['VENDA MEDIA DIARIA', 'VENDA MEDIA', 'VENDA MEDIA DIA'],
  estoque_atual: ['ESTOQUE ATUAL', 'ESTOQUE'],
};

function mapear(linhaCabecalho) {
  const mapa = {};
  linhaCabecalho.forEach((valor, indice) => {
    const chave = normaliza(valor);
    for (const [campo, aceitos] of Object.entries(COLUNAS)) {
      if (aceitos.includes(chave) && mapa[campo] === undefined) mapa[campo] = indice;
    }
  });
  return mapa;
}

export async function lerPlanilha(arquivo) {
  const XLSX = await import(PLANILHA_URL);
  const buffer = await arquivo.arrayBuffer();
  const livro = XLSX.read(buffer, { type: 'array' });

  const nomeAba = livro.SheetNames.find((n) => normaliza(n) === 'RELATORIO')
    || livro.SheetNames[0];
  const linhas = XLSX.utils.sheet_to_json(livro.Sheets[nomeAba],
    { header: 1, defval: null });

  const mapa = mapear(linhas[0] || []);
  if (mapa.sku === undefined && mapa.descricao === undefined) {
    throw new Error('Não encontrei as colunas de SKU/descrição no arquivo.');
  }

  const registros = [];
  for (let i = 1; i < linhas.length; i += 1) {
    const linha = linhas[i];
    if (!linha || !linha.some((v) => v !== null && v !== '')) continue;
    const pegar = (campo) => (mapa[campo] !== undefined ? linha[mapa[campo]] : null);

    const es = CAMPOS_POSICAO.reduce((s, k) => s + (Number(pegar(k)) || 0), 0);
    const venda = numero(pegar('venda_media')) || 0;
    const dias = numero(pegar('dias_venda')) || 0;
    const atual = numero(pegar('estoque_atual')) || 0;
    const manter = es + venda * dias;

    registros.push({
      lista: null,
      loja: pegar('loja') ? String(pegar('loja')).trim() : null,
      codigo_categoria: pegar('codigo_categoria'),
      categoria: pegar('categoria'),
      codigo_subcategoria: pegar('codigo_subcategoria'),
      subcategoria: pegar('subcategoria'),
      codigo_familia: pegar('codigo_familia'),
      familia: pegar('familia'),
      sku: pegar('sku') != null ? String(pegar('sku')).trim() : null,
      ean: pegar('ean') != null ? String(pegar('ean')).trim() : null,
      descricao: pegar('descricao') != null ? String(pegar('descricao')).trim() : null,
      embalagem: pegar('embalagem'),
      unidade: pegar('embalagem') || 'UN',
      quantidade_por_embalagem: numero(pegar('quantidade_por_embalagem')),
      gondola: numero(pegar('gondola')),
      ponto_extra: numero(pegar('ponto_extra')),
      geladeira: numero(pegar('geladeira')),
      ponta_gondola: numero(pegar('ponta_gondola')),
      paredao_entrada: numero(pegar('paredao_entrada')),
      deposito: numero(pegar('deposito')),
      fornecedor_codigo: pegar('fornecedor_codigo'),
      fornecedor_nome: pegar('fornecedor_nome'),
      prazo_entrega: numero(pegar('prazo_entrega')),
      dias_venda: numero(pegar('dias_venda')),
      valor_unitario: numero(pegar('valor_unitario')),
      venda_media: numero(pegar('venda_media')),
      estoque_atual: numero(pegar('estoque_atual')),
      estoque_seguranca: es,
      modo_estoque: 'es_dias',
      estoque_manter: Math.round(manter * 1000) / 1000,
      quantidade_sugerida: Math.max(0, Math.round((manter - atual) * 1000) / 1000),
      quantidade: Math.max(0, Math.round((manter - atual) * 1000) / 1000),
      ordem: i,
      importado_em: new Date().toISOString(),
    });
  }

  if (!registros.length) throw new Error('O arquivo não tem linhas de produto.');
  return registros;
}

// Cria/recupera categoria, subcategoria, família, loja e produto.
async function prepararCadastros(registros, aoProgredir) {
  const [cats, subs, fams, lojas, produtos] = await Promise.all([
    listar('arm_categorias', { ordem: 'descricao' }),
    listar('arm_subcategorias', { ordem: 'descricao' }),
    listar('arm_familias', { ordem: 'descricao' }),
    listar('arm_lojas', { ordem: 'nome' }),
    listar('produtos', { select: 'id, sku', ordem: 'sku' }),
  ]);

  const porCodigo = (lista) => new Map(
    lista.map((x) => [String(x.codigo_auxiliar ?? '').trim(), x]));

  const catPorCod = porCodigo(cats);
  const subPorCod = porCodigo(subs);
  const famPorCod = porCodigo(fams);
  // PostgREST devolve no máximo 1000 linhas: produtos são consultados sob demanda
  const prodPorSku = new Map((produtos || []).map((p) => [String(p.sku).trim(), p]));
  // lojas: índice por fantasia e por razão social, para achar de várias formas
  const lojasNorm = lojas.map((l) => ({
    loja: l,
    fantasia: normaliza(l.nome_fantasia),
    razao: normaliza(l.nome),
  }));

  function acharLoja(chave) {
    if (!chave) return null;

    const porFantasia = lojasNorm.find((x) => x.fantasia && x.fantasia === chave);
    if (porFantasia) return porFantasia.loja;

    const porRazao = lojasNorm.find((x) => x.razao === chave);
    if (porRazao) return porRazao.loja;

    // "LOJA 01" encontra "LOJA 01 - MESSEJANA"
    const porPrefixo = lojasNorm.find((x) =>
      (x.fantasia && x.fantasia.startsWith(`${chave} `))
      || (x.razao && x.razao.startsWith(`${chave} `))
      || (x.fantasia && x.fantasia.startsWith(`${chave}-`))
      || (x.razao && x.razao.startsWith(`${chave}-`)));
    return porPrefixo ? porPrefixo.loja : null;
  }

  async function categoria(codigo, descricao) {
    const chave = String(codigo ?? '').trim();
    if (chave && catPorCod.has(chave)) return catPorCod.get(chave).id;
    const novo = await criar('arm_categorias', {
      codigo_auxiliar: chave || null,
      descricao: (descricao || '').trim() || (chave ? `Categoria ${chave}` : 'Sem Categoria'),
    });
    catPorCod.set(String(novo.codigo_auxiliar ?? '').trim(), novo);
    return novo.id;
  }

  async function subcategoria(codigo, descricao, categoriaId) {
    const chave = String(codigo ?? '').trim();
    if (chave && subPorCod.has(chave)) return subPorCod.get(chave).id;
    const novo = await criar('arm_subcategorias', {
      codigo_auxiliar: chave || null,
      descricao: (descricao || '').trim() || (chave ? `Subcategoria ${chave}` : 'Sem Subcategoria'),
      categoria_id: categoriaId,
    });
    subPorCod.set(String(novo.codigo_auxiliar ?? '').trim(), novo);
    return novo.id;
  }

  async function familia(codigo, descricao, categoriaId, subcategoriaId) {
    const chave = String(codigo ?? '').trim();
    if (chave && famPorCod.has(chave)) return famPorCod.get(chave).id;
    const novo = await criar('arm_familias', {
      codigo_auxiliar: chave || null,
      descricao: (descricao || '').trim() || (chave ? `Família ${chave}` : 'Sem Família'),
      categoria_id: categoriaId,
      subcategoria_id: subcategoriaId,
    });
    famPorCod.set(String(novo.codigo_auxiliar ?? '').trim(), novo);
    return novo.id;
  }

  async function loja(nome) {
    const chave = normaliza(nome);
    if (!chave) return null;

    const existente = acharLoja(chave);
    if (existente) return existente.id;

    const nova = await criar('arm_lojas', {
      nome: String(nome).trim(), nome_fantasia: String(nome).trim(), ativa: true,
    });
    lojasNorm.push({ loja: nova, fantasia: chave, razao: chave });
    return nova.id;
  }

  async function produto(registro, vinculos) {
    const sku = String(registro.sku ?? '').trim();
    if (!sku) return null;

    if (prodPorSku.has(sku)) return prodPorSku.get(sku).id;

    // procura no banco antes de criar (a lista em memória pode estar incompleta)
    const achados = await listar('produtos', { select: 'id, sku', eq: { sku } });
    if (achados.length) {
      prodPorSku.set(sku, achados[0]);
      return achados[0].id;
    }

    const base = {
      sku,
      descricao: registro.descricao || sku,
      unidade: registro.embalagem || 'UN',
      ativo: true,
      origem: 'sugestao',
      categoria_id: vinculos.categoria_id,
      subcategoria_id: vinculos.subcategoria_id,
      familia_id: vinculos.familia_id,
    };

    for (const ean of [registro.ean || sku, sku, null]) {
      try {
        const novo = await criar('produtos', { ...base, ean });
        prodPorSku.set(sku, novo);
        return novo.id;
      } catch (erro) {
        if (!/existe/i.test(erro.message)) throw erro;
      }
    }

    throw new Error(`Não foi possível criar o produto SKU ${sku}.`);
  }

  let indice = 0;
  for (const registro of registros) {
    indice += 1;
    const catId = await categoria(registro.codigo_categoria, registro.categoria);
    const subId = await subcategoria(registro.codigo_subcategoria, registro.subcategoria, catId);
    const famId = await familia(registro.codigo_familia, registro.familia, catId, subId);

    registro.loja_id = await loja(registro.loja);
    registro.produto_id = await produto(registro, {
      categoria_id: catId, subcategoria_id: subId, familia_id: famId,
    });

    if (aoProgredir && indice % 5 === 0) {
      aoProgredir(`cadastros ${indice}/${registros.length}…`);
    }
  }
}

export async function importarLista({
  ctx, lista, arquivo, criarCadastros = true, limpar = false, aoProgredir,
}) {
  const registros = await lerPlanilha(arquivo);
  if (aoProgredir) aoProgredir(`${registros.length} linha(s) lida(s)…`);

  if (criarCadastros) {
    await prepararCadastros(registros, aoProgredir);
  }

  if (limpar) {
    const { excluirOnde } = await import('./api.js?v=20261122p');
    await excluirOnde('lista_de_produtos', { lista });
  }

  const TAMANHO = 100;
  for (let i = 0; i < registros.length; i += TAMANHO) {
    const lote = registros.slice(i, i + TAMANHO).map((r) => ({ ...r, lista }));
    await criar('lista_de_produtos', lote);
    if (aoProgredir) {
      aoProgredir(`gravando ${Math.min(i + TAMANHO, registros.length)}/${registros.length}…`);
    }
  }

  // A lista é só um molde: a sugestão de pedido é criada depois,
  // quando o usuário escolher "Nova sugestão".
  return registros.length;
}

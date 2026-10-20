// Favorito (bookmarklet) para el facturador gratuito del SII.
//
// Cómo funciona:
//   1. En el sistema, «Copiar para el SII» copia un código (VS1:{…}) con los
//      datos de la factura.
//   2. En el facturador del SII, primer clic en el favorito: lee el código
//      (del portapapeles o pegándolo) y escribe el RUT del cliente.
//   3. Cuando el SII carga los datos del cliente, segundo clic: escribe el
//      detalle y las referencias a las órdenes de venta (nota de pedido, 802).
//   Nada se envía a ningún lado: el favorito solo escribe en la página abierta.
//
// Los nombres de los campos del SII pueden cambiar. El favorito busca por
// partes del nombre (RUT_RECEP, NMB_01, QTY_01…) y, si no encuentra algo,
// lo dice y ofrece copiar la lista de campos de la página para ajustarlo.

/* eslint-disable no-var */
function favorito() {
  var K = 'vsFacturaSII';
  var docs = [document];
  try { for (var i = 0; i < window.frames.length; i++) { try { if (window.frames[i].document) docs.push(window.frames[i].document); } catch (e) { /* otro dominio */ } } } catch (e) { /* sin marcos */ }
  function todos() {
    var r = [];
    docs.forEach(function (d) { r = r.concat([].slice.call(d.querySelectorAll('input, select, textarea'))); });
    return r;
  }
  function buscar(base, n) {
    var re = n == null ? new RegExp(base + '$', 'i') : new RegExp(base + '_?0*' + n + '$', 'i');
    return todos().filter(function (e) { return re.test(e.name || '') || re.test(e.id || ''); })[0];
  }
  function poner(el, v) {
    if (!el) return false;
    el.focus();
    if (el.tagName === 'SELECT') {
      var op = [].slice.call(el.options).filter(function (o) { return o.value === String(v) || o.text.indexOf(String(v)) >= 0 || (String(v) === '802' && /nota de pedido/i.test(o.text)); })[0];
      if (!op) return false;
      el.value = op.value;
    } else el.value = v;
    ['input', 'change', 'keyup', 'blur'].forEach(function (t) { el.dispatchEvent(new Event(t, { bubbles: true })); });
    return true;
  }
  function esperar(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
  function agregarLinea() {
    var b = [];
    docs.forEach(function (d) { b = b.concat([].slice.call(d.querySelectorAll('button, input[type=button], a'))); });
    var x = b.filter(function (e) { return /agregar\s*(l.{1,2}nea|detalle|[ií]tem|item)/i.test(e.value || e.textContent || '') || /AGREGA.*(LIN|DET)/i.test(e.name || e.id || ''); })[0];
    if (x) { x.click(); return true; }
    return false;
  }
  function listaCampos() {
    return todos().map(function (e) { return (e.name || e.id || '?') + (e.type ? ':' + e.type : ''); }).join(' ');
  }
  function leerCodigo(t) {
    t = String(t || '').trim();
    if (t.indexOf('VS1:') !== 0) return null;
    try { return JSON.parse(t.slice(4)); } catch (e) { return null; }
  }

  async function paso1() {
    var d = null;
    try { d = leerCodigo(await navigator.clipboard.readText()); } catch (e) { /* sin permiso */ }
    if (!d) d = leerCodigo(prompt('Pega el código de la factura.\n(En el sistema: Ventas → Por facturar → «Copiar para el SII»)'));
    if (!d) { alert('Ese no es un código del sistema. Vuelve a copiarlo con «Copiar para el SII».'); return; }
    var rut = buscar('RUT_RECEP'), dv = buscar('DV_RECEP');
    if (!rut) {
      prompt('No encontré el campo del RUT del receptor. ¿Estás en la página de emitir factura?\nSi lo estás, copia esto y mándalo para ajustar el favorito:', listaCampos().slice(0, 4000));
      return;
    }
    if (dv) { poner(rut, d.rut); poner(dv, d.dv); } else poner(rut, d.rutCompleto);
    d.paso = 2;
    sessionStorage.setItem(K, JSON.stringify(d));
    alert('Listo el RUT de ' + d.razonSocial + '.\nEspera que el SII cargue los datos del cliente y vuelve a hacer clic en el favorito.');
  }

  async function paso2(d) {
    var faltan = [];
    if (d.giro && buscar('GIRO_RECEP') && !buscar('GIRO_RECEP').value) poner(buscar('GIRO_RECEP'), d.giro.slice(0, 40));
    if (d.direccion && buscar('DIR_RECEP') && !buscar('DIR_RECEP').value) poner(buscar('DIR_RECEP'), d.direccion.slice(0, 70));
    if (d.comuna && buscar('CMNA_RECEP') && !buscar('CMNA_RECEP').value) poner(buscar('CMNA_RECEP'), d.comuna);
    if (d.ciudad && buscar('CIUDAD_RECEP') && !buscar('CIUDAD_RECEP').value) poner(buscar('CIUDAD_RECEP'), d.ciudad);
    for (var i = 0; i < d.lineas.length; i++) {
      var n = i + 1, l = d.lineas[i];
      if (!buscar('NMB', n)) { agregarLinea(); await esperar(400); }
      if (!poner(buscar('NMB', n), l.nombre)) { faltan.push('línea ' + n + ': ' + l.cantidad + ' × ' + l.nombre + ' a $' + l.precio); continue; }
      poner(buscar('QTY', n), l.cantidad);
      poner(buscar('PRC', n), l.precio);
    }
    for (var j = 0; j < d.referencias.length; j++) {
      var m = j + 1, r = d.referencias[j];
      var tipo = buscar('TPO_DOC_REF', m) || buscar('TIPO_DOC_REF', m);
      if (!tipo) { faltan.push('referencia ' + m + ': nota de pedido (802) N° ' + r.folio + ' del ' + r.fecha); continue; }
      poner(tipo, r.tipo);
      await esperar(150);
      poner(buscar('FOLIO_REF', m), r.folio);
      poner(buscar('FCH_REF', m) || buscar('FECHA_REF', m), r.fecha);
      poner(buscar('RAZON_REF', m), r.razon);
    }
    sessionStorage.removeItem(K);
    if (faltan.length) {
      alert('Escribí lo que encontré. Falta escribir a mano:\n\n' + faltan.join('\n') + '\n\nTotal esperado: $' + d.total + ' (neto $' + d.neto + ').');
    } else {
      alert('Listo: ' + d.lineas.length + ' línea(s) y ' + d.referencias.length + ' referencia(s).\nRevisa que el total sea $' + d.total + ' antes de firmar.');
    }
  }

  var guardado = null;
  try { guardado = JSON.parse(sessionStorage.getItem(K) || 'null'); } catch (e) { guardado = null; }
  if (guardado && guardado.paso === 2) {
    if (confirm('Segundo paso: escribir el detalle y las referencias de la factura a ' + guardado.razonSocial + '.\n\n(Cancelar = empezar de nuevo con otro código)')) paso2(guardado);
    else { sessionStorage.removeItem(K); paso1(); }
  } else paso1();
}
/* eslint-enable no-var */

export const enlaceFavorito = () => `javascript:${encodeURIComponent(`(${favorito.toString()})();void 0`)}`;

// Página del facturador gratuito (factura electrónica, código 33).
export const URL_FACTURADOR_SII = 'https://www1.sii.cl/cgi-bin/Portal001/mipeLaunchPage.cgi?OPCION=33&TIPO=4';

// Copia texto al portapapeles (con plan B para navegadores sin permiso).
export async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true; } catch { /* sigue */ }
  const t = document.createElement('textarea');
  t.value = texto; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
  document.body.append(t); t.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  t.remove();
  return ok;
}

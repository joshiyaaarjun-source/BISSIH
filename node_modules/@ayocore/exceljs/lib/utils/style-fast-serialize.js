// Fast style serializer for cache key generation
// Produces a compact separator-delimited string instead of JSON.stringify

const SEP = '|';
const SUB = ',';

function serializeColor(color) {
  if (!color) return '';
  const parts = [];
  if (color.argb) parts.push(`a:${color.argb}`);
  if (color.theme !== undefined) parts.push(`t:${color.theme}`);
  if (color.tint !== undefined) parts.push(`n:${color.tint}`);
  if (color.indexed !== undefined) parts.push(`i:${color.indexed}`);
  return parts.join(SUB);
}

function serializeFont(font) {
  if (!font) return '';
  const parts = [
    font.name || '',
    font.size || '',
    font.family || '',
    font.scheme || '',
    font.charset || '',
    font.bold ? '1' : '',
    font.italic ? '1' : '',
    font.underline || '',
    font.vertAlign || '',
    font.strike ? '1' : '',
    font.outline ? '1' : '',
    font.shadow ? '1' : '',
    font.condense ? '1' : '',
    font.extend ? '1' : '',
    serializeColor(font.color),
  ];
  return parts.join(SUB);
}

function serializeBorderEdge(edge) {
  if (!edge) return '';
  return `${edge.style || ''}${SUB}${serializeColor(edge.color)}`;
}

function serializeBorder(border) {
  if (!border) return '';
  return [
    serializeBorderEdge(border.left),
    serializeBorderEdge(border.right),
    serializeBorderEdge(border.top),
    serializeBorderEdge(border.bottom),
    serializeBorderEdge(border.diagonal),
    border.diagonalUp ? '1' : '',
    border.diagonalDown ? '1' : '',
  ].join(SUB);
}

function serializeFill(fill) {
  if (!fill) return '';
  if (fill.type === 'pattern') {
    return [
      'p',
      fill.pattern || '',
      serializeColor(fill.fgColor),
      serializeColor(fill.bgColor),
    ].join(SUB);
  }
  if (fill.type === 'gradient') {
    const stops = (fill.stops || []).map(s => `${s.position}:${serializeColor(s.color)}`).join(';');
    return ['g', fill.gradient || '', fill.degree || '', fill.center || '', stops].join(SUB);
  }
  return '';
}

function serializeAlignment(alignment) {
  if (!alignment) return '';
  return [
    alignment.horizontal || '',
    alignment.vertical || '',
    alignment.wrapText ? '1' : '',
    alignment.shrinkToFit ? '1' : '',
    alignment.indent || '',
    alignment.textRotation || '',
    alignment.readingOrder || '',
  ].join(SUB);
}

function serializeLocked(locked) {
  if (locked === false) return '0';
  if (locked) return '1';
  return '';
}

function serializeProtection(protection) {
  if (!protection) return '';
  return [serializeLocked(protection.locked), protection.hidden ? '1' : ''].join(SUB);
}

function serializeStyle(model) {
  if (!model) return '';
  return [
    model.numFmt || '',
    serializeFont(model.font),
    serializeBorder(model.border),
    serializeFill(model.fill),
    serializeAlignment(model.alignment),
    serializeProtection(model.protection),
  ].join(SEP);
}

module.exports = {serializeStyle};

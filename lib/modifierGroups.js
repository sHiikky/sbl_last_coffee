// Grouping changes presentation only. Unknown additions always remain available
// under "Other"; original SKU IDs, prices, order and compatibility are preserved.
export function modifierGroupId(modifier) {
  const name = String(modifier?.displayName || modifier?.name || '').toLocaleLowerCase('ru-RU');
  if (/молок|сливк/.test(name)) return 'milk';
  if (/сироп/.test(name)) return 'syrup';
  return 'other';
}

export function groupModifiers(modifiers = []) {
  const groups = [
    { id: 'milk', title: 'Молоко и сливки', items: [] },
    { id: 'syrup', title: 'Сиропы', items: [] },
    { id: 'other', title: 'Другие добавки', items: [] },
  ];
  for (const modifier of modifiers) {
    groups.find(group => group.id === modifierGroupId(modifier)).items.push(modifier);
  }
  return groups.filter(group => group.items.length > 0);
}
